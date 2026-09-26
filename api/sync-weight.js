// api/sync-weight.js
// 保存済みのWithingsトークンを使って体重データを取得し、weight_logsに保存する。
//
// 使い方:
//   /api/sync-weight            … 直近7日分を同期(Cronはこれ)
//   /api/sync-weight?days=30    … 直近30日分をさかのぼって同期(取りこぼしの回収用、最大90日)
//   /api/sync-weight?debug=1    … 調査用。Withingsから何件返ってきたか、保存エラーの中身などを返す
//
// 【トークンの仕様メモ(Withings公式)】
// - access_token は3時間、refresh_token は1年有効。
// - リフレッシュすると新しい refresh_token が発行される。古い refresh_token は
//   「新しい access_token を初めて使った時点」または「8時間後」の早い方で無効になる。
//   → 新トークンをDBに保存できなかった場合は、新しい access_token を使わずに止めること。
//     そうすれば古い refresh_token が生き残り、次回の同期で復旧できる。

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2分以上ロックが続いていたら、異常終了とみなして解除する
const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const JST_OFFSET_SEC = 9 * 60 * 60;

async function refreshAccessToken(tokenRow) {
  const response = await fetch('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id: process.env.WITHINGS_CLIENT_ID,
      client_secret: process.env.WITHINGS_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
    }),
  });

  const data = await response.json();
  if (data.status !== 0) {
    throw new Error('トークンの更新に失敗しました: ' + JSON.stringify(data));
  }

  const { access_token, refresh_token, expires_in } = data.body;

  const { error: saveError } = await supabase
    .from('withings_tokens')
    .update({
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  // 保存に失敗したら、新しい access_token は使わずにここで止める(古い refresh_token を守るため)
  if (saveError) {
    throw new Error('新しいトークンの保存に失敗しました: ' + saveError.message);
  }

  return access_token;
}

// Withingsの測定データを取得する(件数が多い場合の続きページにも対応)
async function fetchMeasureGroups(accessToken, startdate, enddate) {
  const groups = [];
  const rawStatuses = [];
  let offset = null;

  for (let page = 0; page < 10; page++) {
    const params = {
      action: 'getmeas',
      meastypes: '1,6', // 1=体重, 6=体脂肪率
      category: '1', // 1=実測値
      startdate: String(startdate),
      enddate: String(enddate),
    };
    if (offset != null) params.offset = String(offset);

    const res = await fetch('https://wbsapi.withings.net/measure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`,
      },
      body: new URLSearchParams(params),
    });
    const data = await res.json();
    rawStatuses.push(data.status);

    if (data.status !== 0) {
      throw new Error('Withings測定データの取得に失敗しました: ' + JSON.stringify(data));
    }

    groups.push(...(data.body.measuregrps || []));
    if (!data.body.more) break;
    offset = data.body.offset;
  }

  return { groups, rawStatuses };
}

// UNIX秒 → 日本時間の日付文字列(YYYY-MM-DD)
function toJstDate(unixSec) {
  return new Date((unixSec + JST_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const debug = req.query?.debug === '1';
  const days = Math.min(Math.max(parseInt(req.query?.days, 10) || DEFAULT_DAYS, 1), MAX_DAYS);

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
    }

    await supabase
      .from('withings_tokens')
      .update({ sync_in_progress: true, sync_started_at: new Date().toISOString() })
      .eq('id', 1);

    try {
      let accessToken = tokenRow.access_token;
      let refreshed = false;
      if (new Date(tokenRow.expires_at) <= new Date()) {
        accessToken = await refreshAccessToken(tokenRow);
        refreshed = true;
      }

      const now = Math.floor(Date.now() / 1000);
      const startdate = now - days * 24 * 60 * 60;
      const { groups, rawStatuses } = await fetchMeasureGroups(accessToken, startdate, now);

      // 古い順に並べる(同じ日に複数回測った場合、その日の最後の測定値が残るように)
      groups.sort((a, b) => a.date - b.date);

      const results = [];
      const upsertErrors = [];
      let skippedNoWeight = 0;

      for (const group of groups) {
        let weightKg = null;
        let fatPercent = null;
        for (const m of group.measures) {
          if (m.type === 1) weightKg = m.value * Math.pow(10, m.unit);
          if (m.type === 6) fatPercent = m.value * Math.pow(10, m.unit);
        }

        if (weightKg == null) {
          skippedNoWeight++;
          continue;
        }

        const dateStr = toJstDate(group.date);
        const { error: upsertError } = await supabase.from('weight_logs').upsert(
          {
            logged_date: dateStr,
            weight_kg: weightKg.toFixed(2),
            body_fat_percent: fatPercent != null ? fatPercent.toFixed(1) : null,
          },
          { onConflict: 'logged_date' }
        );

        if (upsertError) {
          // 以前はここを黙ってスキップしていた。原因が見えるように記録して返す
          console.error('weight_logs upsert error:', dateStr, upsertError);
          upsertErrors.push({ date: dateStr, message: upsertError.message, code: upsertError.code });
        } else {
          results.push({ date: dateStr, weight_kg: weightKg.toFixed(2) });
        }
      }

      const body = { synced: results.length, days, results };
      if (upsertErrors.length > 0) body.upsertErrors = upsertErrors;

      if (debug) {
        body.debug = {
          withings_user_id: tokenRow.withings_user_id,
          token_refreshed_this_run: refreshed,
          token_expires_at_before_run: tokenRow.expires_at,
          range: { from: new Date(startdate * 1000).toISOString(), to: new Date(now * 1000).toISOString() },
          withings_status: rawStatuses,
          measuregrps_count: groups.length,
          skipped_no_weight: skippedNoWeight,
          sample_groups: groups.slice(-3).map((g) => ({
            date_utc: new Date(g.date * 1000).toISOString(),
            category: g.category,
            deviceid_present: !!g.deviceid,
            measures: g.measures.map((m) => ({ type: m.type, value: m.value, unit: m.unit })),
          })),
        };
      }

      res.status(upsertErrors.length > 0 ? 500 : 200).json(body);
    } finally {
      await supabase.from('withings_tokens').update({ sync_in_progress: false }).eq('id', 1);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}