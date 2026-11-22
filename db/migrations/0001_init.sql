-- 앱 데이터 스키마. 인증 테이블(user, session…)은 0000_auth.sql 참고
-- 카드·계좌번호 컬럼은 일부러 만들지 않는다

create type category as enum ('식비','교통','주거','쇼핑','의료','문화','기타');

create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  raw_text text,
  extracted jsonb,            -- extract_receipt가 검증한 항목, save_expense가 expenses로 옮김
  created_at timestamptz not null default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  receipt_id uuid references receipts on delete cascade,
  store text not null,
  amount int not null check (amount > 0),   -- 원 단위 정수
  category category not null,
  spent_on date not null,
  created_at timestamptz not null default now(),
  unique (receipt_id, store, amount, spent_on)  -- 같은 영수증 중복 저장 방지
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  model text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  ok boolean not null,
  created_at timestamptz not null default now()
);

-- 월별 조회와 일일 호출 수 집계용
create index on expenses (user_id, spent_on);
create index on usage_logs (user_id, created_at);
create index on messages (user_id, created_at);

-- RLS: 본인 행만 허용. FORCE로 소유자에게도 적용한다
do $$
declare t text;
begin
  foreach t in array array['receipts','expenses','messages','usage_logs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy own on %I for all to app_user
      using (user_id = current_setting('app.user_id', true))
      with check (user_id = current_setting('app.user_id', true))$p$, t);
    execute format('grant select, insert, update, delete on %I to app_user', t);
  end loop;
end $$;
