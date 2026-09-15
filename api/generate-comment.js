// api/generate-comment.js
// サマリー画面の集計データ(体重推移・摂取/消費カロリーの要約)をClaude APIに渡し、
// 状況を踏まえた短いコメントを生成する。
//
// 想定するリクエスト(JSON):
// {
//   "periodDays": 14,
//   "latestWeight": 68.5,
//   "weightChange": -1.2,
//   "latestBodyFat": 20.1,
//   "bodyFatChange": -0.8,
//   "avgIntake": 1850,
//   "avgBurn": 2100,
//   "daysOverIntake": 3,   // 期間内で摂取が消費を上回った日数
//   "totalDays": 14
// }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ対応しています' });
  }

  try {
    const {
      periodDays, latestWeight, weightChange, latestBodyFat, bodyFatChange,
      avgIntake, avgBurn, daysOverIntake, totalDays, goalMetric, goalValue, toneInstruction,
    } = req.body;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');

    const goalLine = goalValue != null && goalMetric === 'weight_kg'
      ? `- 目標体重: ${goalValue}kg(現在との差: ${(latestWeight - goalValue).toFixed(1)}kg)`
      : '';

    // ユーザーが自由記述したトーン指定。長すぎる指示で他の指示が埋もれないよう長さを制限する。
    const toneLine = toneInstruction
      ? `\n【口調の指定(ユーザー希望)】\n${String(toneInstruction).slice(0, 300)}\nこの指定は文体・トーンにのみ適用し、上記のコメント方針(誠実さ・医療的断定を避ける等)は変えないこと。`
      : '';

    const prompt = `以下は、あるユーザーの直近${periodDays}日間の体重・カロリー収支データです。このデータを踏まえて、2〜3文程度の短いコメントを日本語で生成してください。

【データ】
- 現在の体重: ${latestWeight}kg(この期間で${weightChange > 0 ? '+' : ''}${weightChange}kg)
${goalLine}
- 体脂肪率: ${latestBodyFat != null ? latestBodyFat + '%' : '不明'}${bodyFatChange != null ? `(この期間で${bodyFatChange > 0 ? '+' : ''}${bodyFatChange}%)` : ''}
- 平均摂取カロリー: ${avgIntake}kcal/日
- 平均消費カロリー(基礎代謝+運動): ${avgBurn}kcal/日
- 摂取が消費を上回った日数: ${daysOverIntake}日 / ${totalDays}日中

【コメントの方針】
- 良い傾向は素直に評価し、気になる点があれば穏やかに指摘する
- 目標値が分かっている場合は、現在地との距離感にも軽く触れる
- 説教くさくならず、前向きで簡潔な文章にする
- 数値をそのまま繰り返すだけの説明文にはしない
- 医療的な断定(診断・処方的な助言)は避け、一般的な傾向として述べる
- 出力はコメント本文のみ。前置きや見出しは不要
${toneLine}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude APIエラー: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b) => b.type === 'text');
    if (!textBlock) throw new Error('コメントの生成に失敗しました');

    res.status(200).json({ comment: textBlock.text.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
