/**
 * lib/calorieAnalyzer.js
 *
 * カロリー解析の「差し替え可能な」ラッパー層。
 * 呼び出し側(APIルート)はこのモジュールの analyzeFoodImage() だけを呼べばよく、
 * 中身がClaudeでもGeminiでも自作モデルでも、呼び出し側のコードは変更不要。
 *
 * 差し替え方法:
 *   1. 新しいプロバイダ用の analyzeWithXXX() 関数を追加する
 *   2. analyzeFoodImage() 内の呼び出し先を切り替える(環境変数で分岐も可)
 */

// ===== 共通の出力フォーマット(プロバイダが変わってもこの形は維持する) =====
// {
//   foodName: string,
//   kcal: number,
//   protein: number,  // g
//   fat: number,       // g
//   carbs: number,     // g
//   provider: string,  // どのAPIで解析したか("claude" | "gemini" | ...)
// }

const PROVIDER = process.env.CALORIE_ANALYZER_PROVIDER || 'claude';

/**
 * メインの公開関数。呼び出し側はこれだけを使う。
 * @param {string} base64Image - Base64エンコードされた画像データ(data:image/...の後ろの部分)
 * @param {string} mediaType - 'image/jpeg' など
 * @param {string} [userComment] - ユーザーが補足したコメント(例:「並盛だった」「半分残した」)
 * @returns {Promise<{foodName, kcal, protein, fat, carbs, provider}>}
 */
async function analyzeFoodImage(base64Image, mediaType, userComment) {
  switch (PROVIDER) {
    case 'claude':
      return analyzeWithClaude(base64Image, mediaType, userComment);
    // case 'gemini':
    //   return analyzeWithGemini(base64Image, mediaType, userComment);
    default:
      throw new Error(`未対応のプロバイダです: ${PROVIDER}`);
  }
}

/**
 * Claude API(Anthropic)を使った実装
 */
async function analyzeWithClaude(base64Image, mediaType, userComment) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');

  let promptText =
    'この写真の食事内容から、推定カロリー(kcal)、たんぱく質(g)、脂質(g)、炭水化物(g)を計算してください。';

  // ユーザーからの補足コメントがあれば、判定の精度を上げるために必ず優先して反映する
  if (userComment && userComment.trim() !== '') {
    promptText +=
      `\n\n【ユーザーからの補足情報】${userComment.trim()}\n` +
      'この補足情報は写真だけでは分からない実際の状況(量・残した分量など)を示しています。' +
      '写真から一見判断できる内容より、この補足情報を優先してカロリー・栄養成分を計算してください。';
  }

  promptText +=
    '\n\n回答はJSON形式のみで、他の文章は含めないでください。' +
    '形式: {"food_name": "料理名", "kcal": 数値, "protein": 数値, "fat": 数値, "carbs": 数値}';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            {
              type: 'text',
              text: promptText,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude APIエラー: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('解析結果のテキストが取得できませんでした');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  return {
    foodName: parsed.food_name,
    kcal: Math.round(parsed.kcal),
    protein: Math.round(parsed.protein),
    fat: Math.round(parsed.fat),
    carbs: Math.round(parsed.carbs),
    provider: 'claude',
  };
}

/**
 * 将来の差し替え例(未実装のスケルトンのみ)
 *
 * async function analyzeWithGemini(base64Image, mediaType) {
 *   // Gemini API呼び出し処理をここに実装
 *   // 戻り値は上と同じ共通フォーマットに合わせる
 * }
 */

export { analyzeFoodImage };
