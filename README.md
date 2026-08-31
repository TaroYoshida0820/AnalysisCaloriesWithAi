# AnalysisCaloriesWithAi

写真を撮るとAIがカロリーを解析し、Supabaseに日付付きで記録するアプリ。

## 構成

- **フロントエンド**: React + Vite
- **バックエンド**: Vercel サーバーレス関数 (`api/analyze-food.js`)
- **カロリー解析**: `lib/calorieAnalyzer.js` 経由でClaude APIを呼び出し
  (将来、他のAI APIに差し替える場合は `CALORIE_ANANLYZER_PROVIDER` 環境変数を変更し、
  `lib/calorieAnalyzer.js` に新しいプロバイダ関数を追加するだけでよい)
- **データベース**: Supabase (PostgreSQL)。テーブル定義は `supabase_schema.sql` を参照

## セットアップ

1. 依存関係のインストール
   ```
   npm install
   ```

2. Supabaseで `supabase_schema.sql` をSQL Editorで実行し、テーブルを作成

3. `.env.example` を参考に、Vercelの環境変数を設定
   - `ANTHROPIC_API_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

4. ローカル開発
   ```
   npm run dev
   ```

5. Vercelにデプロイ(GitHub連携でpushするだけで自動デプロイ)

## テーブル設計

`supabase_schema.sql` に、食事記録・体重記録・基礎代謝記録・運動記録の4テーブルと、
それらを日付で突き合わせる `daily_summary` ビューを定義している。
Row Level Security (RLS) を有効化済み。
