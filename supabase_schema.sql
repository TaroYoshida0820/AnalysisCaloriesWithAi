-- Supabase (PostgreSQL) テーブル設計
-- SQLエディタでそのまま実行できます

-- 食事記録テーブル
create table food_logs (
  id bigint generated always as identity primary key,
  logged_date date not null,              -- 記録日(YYYY-MM-DD)
  food_name text not null,                 -- 推定メニュー名
  kcal integer not null,
  protein_g integer,
  fat_g integer,
  carbs_g integer,
  provider text default 'claude',          -- どのAPIで解析したか(切り替え履歴の追跡用)
  photo_url text,                          -- 将来、写真自体も保存したくなった場合用
  created_at timestamptz default now()
);

-- 体重記録テーブル(既存のiPhoneショートカット連携から流し込む想定)
create table weight_logs (
  id bigint generated always as identity primary key,
  logged_date date not null unique,        -- 1日1レコード想定
  weight_kg numeric(5,2) not null,
  created_at timestamptz default now()
);

-- 基礎代謝(BMR)記録テーブル
-- 体重・体組成の変化に応じて基礎代謝も変わるため、日付ごとに記録できる形にしてある
create table bmr_logs (
  id bigint generated always as identity primary key,
  logged_date date not null unique,
  bmr_kcal integer not null,               -- 基礎代謝カロリー
  calc_method text,                        -- 算出方法(体組成計の推定値、計算式、等)
  created_at timestamptz default now()
);

-- 運動記録テーブル(1日に複数の運動をする可能性があるので日付ユニーク制約なし)
create table exercise_logs (
  id bigint generated always as identity primary key,
  logged_date date not null,
  exercise_type text not null,             -- 運動の種類(ウォーキング、筋トレ、等)
  duration_min integer,                    -- 実施時間(分)
  burned_kcal integer not null,            -- 消費カロリー
  source text default 'manual',            -- 'manual'(手入力) / 'apple_health'(連携) 等
  created_at timestamptz default now()
);

-- インデックス
create index idx_bmr_logs_date on bmr_logs (logged_date);
create index idx_exercise_logs_date on exercise_logs (logged_date);

-- ===== Row Level Security(RLS) =====
-- 個人専用アプリなので「認証済みユーザーのみ読み書き可能」というシンプルな設計にする。
-- (将来、家族利用や複数ユーザー対応にする場合は user_id 列を各テーブルに追加し、
--  auth.uid() = user_id の条件を加えたポリシーに変更する)

alter table food_logs enable row level security;
alter table weight_logs enable row level security;
alter table bmr_logs enable row level security;
alter table exercise_logs enable row level security;

-- 認証済みユーザー(自分)のみ全操作を許可
create policy "認証済みユーザーは食事記録を操作可能"
  on food_logs for all
  to authenticated
  using (true)
  with check (true);

create policy "認証済みユーザーは体重記録を操作可能"
  on weight_logs for all
  to authenticated
  using (true)
  with check (true);

create policy "認証済みユーザーは基礎代謝記録を操作可能"
  on bmr_logs for all
  to authenticated
  using (true)
  with check (true);

create policy "認証済みユーザーは運動記録を操作可能"
  on exercise_logs for all
  to authenticated
  using (true)
  with check (true);

-- 日付で高速に絞り込めるようにインデックスを付与
create index idx_food_logs_date on food_logs (logged_date);
create index idx_weight_logs_date on weight_logs (logged_date);

-- 体重×摂取カロリー×基礎代謝×運動カロリーを日付で突き合わせて見るビュー
-- カロリー収支(摂取 - 消費)も自動計算する
-- security_invoker = true : このビューを見る人の権限で元テーブルのRLSも適用される
create view daily_summary
with (security_invoker = true)
as
select
  d.date,
  w.weight_kg,
  b.bmr_kcal,
  coalesce(f.total_kcal, 0) as intake_kcal,
  coalesce(e.total_burned_kcal, 0) as exercise_kcal,
  coalesce(b.bmr_kcal, 0) + coalesce(e.total_burned_kcal, 0) as total_consumption_kcal,
  coalesce(f.total_kcal, 0) - (coalesce(b.bmr_kcal, 0) + coalesce(e.total_burned_kcal, 0)) as calorie_balance,
  f.total_protein_g,
  f.total_fat_g,
  f.total_carbs_g
from (
  select logged_date as date from food_logs
  union
  select logged_date as date from weight_logs
  union
  select logged_date as date from bmr_logs
  union
  select logged_date as date from exercise_logs
) d
left join weight_logs w on w.logged_date = d.date
left join bmr_logs b on b.logged_date = d.date
left join (
  select logged_date, sum(kcal) as total_kcal,
         sum(protein_g) as total_protein_g,
         sum(fat_g) as total_fat_g,
         sum(carbs_g) as total_carbs_g
  from food_logs group by logged_date
) f on f.logged_date = d.date
left join (
  select logged_date, sum(burned_kcal) as total_burned_kcal
  from exercise_logs group by logged_date
) e on e.logged_date = d.date
order by d.date desc;
