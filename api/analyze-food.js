// api/analyze-food.js
// Vercelのサーバーレス関数。ブラウザからはこのエンドポイントだけを叩く。
// APIキー(ANTHROPIC_API_KEY)はVercelの環境変数に設定し、フロントには一切渡さない。

const { analyzeFoodImage } = require('../lib/calorieAnalyzer');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ対応しています' });
  }

  try {
    const { imageBase64, mediaType } = req.body;
    if (!imageBase64 || !mediaType) {
      return res.status(400).json({ error: 'imageBase64 と mediaType が必要です' });
    }

    const result = await analyzeFoodImage(imageBase64, mediaType);
    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
