// api/sync-weight.js
// 保存済みのWithingsトークンを使って体重データを取得し、weight_logsに保存する。
// Vercel Cron(定期実行)から呼び出す想定だが、手動でこのURLにアクセスしても動作する。

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// アクセストークンが期限切れの場合、リフレッシュトークンで更新する
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
    // 保存済みトークンを取得
    const { data: tokenRow, error: tokenError } = await supabase
      .from('withings_tokens')
      .select('*')
      .eq('id', 1)
      .single();

    if (tokenError || !tokenRow) {
      return res.status(400).json({ error: 'Withingsのトークンが見つかりません。先に連携を行ってください。' });
    }

    let accessToken = tokenRow.access_token;

    // トークンの期限が切れていれば更新する
    if (new Date(tokenRow.expires_at) <= new Date()) {
      accessToken = await refreshAccessToken(tokenRow);
    }

    // 直近7日分の体重データを取得する(meastype=1は体重、meastype=6は体脂肪率)
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
        meastypes: '1,6', // 1=体重(kg), 6=体脂肪率(%)
        category: '1',
        startdate: String(sevenDaysAgo),
        enddate: String(now),
      }),
    });

    const measData = await measResponse.json();

    if (measData.status !== 0) {
      return res.status(500).json({ error: 'Withings測定データの取得に失敗しました', detail: measData });
    }

    const groups = measData.body.measuregrps || [];
    const results = [];

    for (const group of groups) {
      const dateStr = new Date(group.date * 1000).toISOString().split('T')[0];

      let weightKg = null;
      for (const m of group.measures) {
        if (m.type === 1) {
          // Withingsの値は value * 10^unit で実数になる
          weightKg = m.value * Math.pow(10, m.unit);
        }
      }

      if (weightKg == null) continue;

      const { error: upsertError } = await supabase
        .from('weight_logs')
        .upsert({ logged_date: dateStr, weight_kg: weightKg.toFixed(2) }, { onConflict: 'logged_date' });

      if (!upsertError) {
        results.push({ date: dateStr, weight_kg: weightKg.toFixed(2) });
      }
    }

    res.status(200).json({ synced: results.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
