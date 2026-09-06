-- Withingsとの連携トークンを保存するテーブル
-- 個人利用のため1レコードのみ運用(id固定=1)する想定
create table withings_tokens (
  id integer primary key,
  withings_user_id text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz default now()
);

-- RLS設定(食事記録などと同様、匿名ユーザーでも運用できるようにする)
alter table withings_tokens enable row level security;

create policy "匿名ユーザーもWithingsトークンを操作可能"
  on withings_tokens for all
  to anon
  using (true)
  with check (true);
