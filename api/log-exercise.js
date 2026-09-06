// api/log-exercise.js
// iPhoneショートカット(オートメーション)から、Apple ヘルスケアの運動データを
// 送信してもらい、Supabaseのexercise_logsに保存するエンドポイント。
//
// 想定するリクエスト(JSON):
// {
//   "logged_date": "2026-09-06",       // 記録対象日(YYYY-MM-DD)
//   "exercise_type": "ウォーキング",     // 運動の種類
//   "duration_min": 32,                 // 実施時間(分)。無ければ null でも可
//   "burned_kcal": 145                  // 消費カロリー(必須)
// }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ対応しています' });
  }

  try {
    const { logged_date, exercise_type, duration_min, burned_kcal } = req.body;

    if (!logged_date || !exercise_type || burned_kcal == null) {
      return res.status(400).json({
        error: 'logged_date, exercise_type, burned_kcal は必須です',
      });
    }

    const { data, error } = await supabase
      .from('exercise_logs')
      .insert({
        logged_date,
        exercise_type,
        duration_min: duration_min ?? null,
        burned_kcal: Math.round(burned_kcal),
        source: 'apple_health', // ショートカット経由であることが分かるようにしておく
      })
      .select();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'データベースへの保存に失敗しました', detail: error.message });
    }

    res.status(200).json({ success: true, entry: data[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}