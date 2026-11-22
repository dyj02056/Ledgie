-- 0001의 receipts.extracted 주석에 나온 save_expense 도구는 없다. extract_receipt 하나가 검증과 저장을 함께 한다

-- 중복 판단: 같은 원문(정규화 후 sha256)은 사용자당 한 번만 저장한다
-- 원문이 없는 입력(이미지 등)은 앱이 (가게, 금액, 날짜) 일치로 의심 건을 찾아 사용자에게 확인한다
alter table receipts add column source_hash text;
alter table receipts add constraint receipts_user_source_key unique (user_id, source_hash);

-- receipt_id는 호출마다 새로 생기므로 이 제약은 중복을 막지 못하고, 같은 영수증의 동일 항목(커피 2잔)만 지웠다
alter table expenses drop constraint if exists expenses_receipt_id_store_amount_spent_on_key;
create index on expenses (user_id, store, amount, spent_on);

-- 사용량: 요청 시작 시 pending으로 넣고 끝날 때 결과로 바꾼다. ok는 하위 호환을 위해 남겨 두고 더는 쓰지 않는다
alter table usage_logs add column status text not null default 'pending'
  check (status in ('pending', 'ok', 'error', 'aborted'));
update usage_logs set status = case when ok then 'ok' else 'error' end;
alter table usage_logs alter column ok drop not null;

-- 사용자를 지우면 앱 데이터도 함께 지운다. 주인 없는 행(이전 테스트 잔여물)은 먼저 정리한다
do $$
declare t text;
begin
  foreach t in array array['receipts','expenses','messages','usage_logs'] loop
    execute format('delete from %I where user_id not in (select id from "user")', t);
    execute format('alter table %I add constraint %I foreign key (user_id) references "user" (id) on delete cascade', t, t || '_user_fk');
  end loop;
end $$;
