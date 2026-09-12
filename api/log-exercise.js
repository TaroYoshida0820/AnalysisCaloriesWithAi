// api/log-exercise.js
// iPhoneショートカットから、Apple ヘルスケアの運動データを受け取り、
// Supabaseのexercise_logsに保存するエンドポイント。
//
// Shortcutsアプリの「ヘルスケアサンプルを検索」の結果は、複数件をそのまま渡すと
// 改行区切りの1本のテキスト(例: "0.427\n0.478\n18.355\n...")として送られてくることが多い。
// これはShortcuts側で無理に数値化・合計しようとせず、そのままVercel側に投げて、
// ここで解析・合計する方針(Maxime Heckel氏の実装例を参考にした設計)。
//
// 想定するリクエスト例:
// {
//   "logged_date": "2026-09-10",
//   "exercise_type": "日常生活",
//   "burned_kcal": "0.427\n0.478\n18.355\n..."   // 改行区切り文字列 でも
//   "burned_kcal": [0.427, 0.478, 18.355]         // 配列 でも
//   "burned_kcal": 145                             // 単一の数値 でも、どれでも受け付ける
// }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * burned_kcal がどんな形で来ても、数値の合計に変換する。
 * - 配列 → 各要素をNumber変換して合計
 * - 改行/カンマ区切りの文字列 → 分割してNumber変換して合計
 * - 単一の数値または数値文字列 → そのまま数値化
 */
function sumBurnedKcal(input) {
  if (Array.isArray(input)) {
    return input.reduce((sum, v) => sum + (Number(v) || 0), 0);
  }

  if (typeof input === 'string') {
    // 改行・カンマ・空白のいずれかで区切られている想定
    const parts = input.split(/[\n,]+/).map((s) => s.trim()).filter((s) => s !== '');
    if (parts.length > 1) {
      return parts.reduce((sum, v) => sum + (Number(v) || 0), 0);
    }
    // 分割しても1件しかない場合は、単一の数値として扱う
    return Number(input) || 0;
  }

  return Number(input) || 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ対応しています' });
  }

  try {
    const { logged_date, exercise_type, duration_min } = req.body;
    let { burned_kcal } = req.body;

    if (!logged_date || !exercise_type || burned_kcal == null) {
      return res.status(400).json({
        error: 'logged_date, exercise_type, burned_kcal は必須です',
      });
    }

    const totalKcal = sumBurnedKcal(burned_kcal);

    if (Number.isNaN(totalKcal)) {
      return res.status(400).json({ error: 'burned_kcal の数値変換に失敗しました', received: burned_kcal });
    }

    const { data, error } = await supabase
      .from('exercise_logs')
      .insert({
        logged_date,
        exercise_type,
        duration_min: duration_min ?? null,
        burned_kcal: Math.round(totalKcal),
        source: 'apple_health',
      })
      .select();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'データベースへの保存に失敗しました', detail: error.message });
    }

    res.status(200).json({ success: true, entry: data[0], summed_kcal: totalKcal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}