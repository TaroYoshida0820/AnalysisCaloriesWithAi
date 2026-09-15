// api/sync-weight.js
// 保存済みのWithingsトークンを使って体重データを取得し、weight_logsに保存する。
//
// 【重要】Withingsのリフレッシュトークンは「一度使うと無効になり、新しいトークンに
// 置き換わる」仕様(ローテーション)のため、複数のリクエストがほぼ同時に実行されると、
// 片方が古い(既に使用済みの)トークンで上書き保存してしまい、以降ずっと認証エラーに
// なる事故が起きる。これを防ぐため、簡易的なロック(withings_tokens.sync_in_progress)
// を使い、同時実行を防止する。

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2分以上ロックが続いていたら、異常終了とみなして解除する

async function refreshAccessToken(tokenRow) {
  const clientId = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;

  const response = await fetch('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenRow.refresh_token,
    }),
  });

  const data = await response.json();
  if (data.status !== 0) {
    throw new Error('トークンの更新に失敗しました: ' + JSON.stringify(data));
  }

  const { access_token, refresh_token, expires_in } = data.body;

  await supabase
    .from('withings_tokens')
    .update({
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  return access_token;
}

export default async function handler(req, res) {
  try {
    const { data: tokenRow, error: tokenError } = await supabase
      .from('withings_tokens')
      .select('*')
      .eq('id', 1)
      .single();

    if (tokenError || !tokenRow) {
      return res.status(400).json({ error: 'Withingsのトークンが見つかりません。先に連携を行ってください。' });
    }

    // ロックの確認:他のリクエストが処理中なら、二重実行を避けるためここで終了する
    if (tokenRow.sync_in_progress) {
      const lockAge = Date.now() - new Date(tokenRow.sync_started_at).getTime();
      if (lockAge < LOCK_TIMEOUT_MS) {
        return res.status(429).json({
          error: '他の同期処理が実行中のため、今回はスキップしました。しばらくしてから再度お試しください。',
        });
      }
      // タイムアウトを超えていれば、異常終了とみなしてロックを引き継いで進める
    }

    // ロックを取得
    await supabase
      .from('withings_tokens')
      .update({ sync_in_progress: true, sync_started_at: new Date().toISOString() })
      .eq('id', 1);

    let accessToken = tokenRow.access_token;

    try {
      if (new Date(tokenRow.expires_at) <= new Date()) {
        accessToken = await refreshAccessToken(tokenRow);
      }

      const now = Math.floor(Date.now() / 1000);
      const sevenDaysAgo = now - 7 * 24 * 60 * 60;

      const measResponse = await fetch('https://wbsapi.withings.net/measure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${accessToken}`,
        },
        body: new URLSearchParams({
          action: 'getmeas',
          meastypes: '1,6',
          category: '1',
          startdate: String(sevenDaysAgo),
          enddate: String(now),
        }),
      });

      const measData = await measResponse.json();

      if (measData.status !== 0) {
        throw new Error('Withings測定データの取得に失敗しました: ' + JSON.stringify(measData));
      }

      const groups = measData.body.measuregrps || [];
      const results = [];

      for (const group of groups) {
        const dateStr = new Date(group.date * 1000).toISOString().split('T')[0];

        let weightKg = null;
        let fatPercent = null;
        for (const m of group.measures) {
          if (m.type === 1) weightKg = m.value * Math.pow(10, m.unit);
          if (m.type === 6) fatPercent = m.value * Math.pow(10, m.unit);
        }

        if (weightKg == null) continue;

        const { error: upsertError } = await supabase.from('weight_logs').upsert(
          {
            logged_date: dateStr,
            weight_kg: weightKg.toFixed(2),
            body_fat_percent: fatPercent != null ? fatPercent.toFixed(1) : null,
          },
          { onConflict: 'logged_date' }
        );

        if (!upsertError) {
          results.push({ date: dateStr, weight_kg: weightKg.toFixed(2) });
        }
      }

      res.status(200).json({ synced: results.length, results });
    } finally {
      // 成功・失敗にかかわらず、必ずロックを解除する
      await supabase
        .from('withings_tokens')
        .update({ sync_in_progress: false })
        .eq('id', 1);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
