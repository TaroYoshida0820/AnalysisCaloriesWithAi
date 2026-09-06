// api/withings-callback.js
// Withingsの認証画面でユーザーが許可した後、ここにリダイレクトされてくる。
// 受け取った認証コードを使ってアクセストークン・リフレッシュトークンを取得し、
// Supabaseに保存しておく(次回以降、体重データ取得時にこのトークンを使う)。

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send('認証コードがありません。連携をやり直してください。');
  }

  try {
    const clientId = process.env.WITHINGS_CLIENT_ID;
    const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
    const redirectUri = process.env.WITHINGS_REDIRECT_URI;

    // 認証コードをアクセストークンに交換する
    const tokenResponse = await fetch('https://wbsapi.withings.net/v2/oauth2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'requesttoken',
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.status !== 0) {
      console.error('Withings token error:', tokenData);
      return res.status(500).send('トークン取得に失敗しました: ' + JSON.stringify(tokenData));
    }

    const { access_token, refresh_token, userid, expires_in } = tokenData.body;

    // トークンをSupabaseに保存(1ユーザー運用なので既存レコードは上書きする)
    const { error } = await supabase.from('withings_tokens').upsert({
      id: 1, // 個人利用なので固定ID
      withings_user_id: userid,
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Supabase save error:', error);
      return res.status(500).send('トークンの保存に失敗しました。');
    }

    res.status(200).send('Withingsとの連携が完了しました。このタブは閉じて構いません。');
  } catch (err) {
    console.error(err);
    res.status(500).send('予期しないエラーが発生しました: ' + err.message);
  }
}
