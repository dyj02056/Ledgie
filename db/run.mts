// 마이그레이션 실행기: 파일 이름 순서대로 한 번씩만 적용한다
import { readdirSync, readFileSync } from "node:fs";
import { Client } from "pg";

const c = new Client({ connectionString: process.env.DATABASE_URL_OWNER });
await c.connect();

// app_user(앱 데이터)와 auth_user(인증 테이블)는 SQL로 만든 일반 역할이라 RLS를 우회하지 못한다
for (const [role, env] of [["app_user", "APP_DB_PASSWORD"], ["auth_user", "AUTH_DB_PASSWORD"]]) {
  const pw = process.env[env];
  if (!pw) throw new Error(`${env}가 필요해요`);
  await c.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = '${role}') then
      create role ${role} login password ${c.escapeLiteral(pw)};
    end if; end $$`);
}

await c.query("create table if not exists _migrations (name text primary key)");
const done = new Set((await c.query("select name from _migrations")).rows.map((r) => r.name));

for (const f of readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(f)) continue;
  await c.query("begin");
  try {
    await c.query(readFileSync(`db/migrations/${f}`, "utf8"));
    await c.query("insert into _migrations values ($1)", [f]);
    await c.query("commit");
    console.log("적용:", f);
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}
await c.end();
