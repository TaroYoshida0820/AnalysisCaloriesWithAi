// api/withings-auth.js
// ユーザーをWithingsの認証画面にリダイレクトするエンドポイント。
// フロントエンドの「Withingsと連携する」ボタンから、このURLに飛ばせばよい。

export default function handler(req, res) {
  const clientId = process.env.WITHINGS_CLIENT_ID;
  const redirectUri = process.env.WITHINGS_REDIRECT_URI; // 例: https://analysis-calories-with-ai.vercel.app/api/withings-callback

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'WITHINGS_CLIENT_ID または WITHINGS_REDIRECT_URI が未設定です' });
  }

  // scope=user.metrics で体重・体組成データへのアクセスを要求する
  const authUrl =
    'https://account.withings.com/oauth2_user/authorize2' +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=user.metrics` +
    `&state=withings_link`; // CSRF対策の簡易的な状態値(今回は固定値でシンプルに)

  res.redirect(302, authUrl);
}
