import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type Client } from "pg";
import { withUser } from "../lib/db";
import { dropUsers, makeUser, ownerClient } from "./helpers";

let owner: Client;
let A = "";
let B = "";
beforeAll(async () => {
  owner = await ownerClient();
  A = await makeUser(owner, "rls-a");
  B = await makeUser(owner, "rls-b");
});
afterAll(async () => {
  await dropUsers(owner, [A, B]);
  await owner.end();
});

// 앱 테이블 4개 모두 같은 규칙을 지키는지 확인한다
const tables: [string, string][] = [
  ["receipts", "insert into receipts (user_id, raw_text) values ($1, '원문') returning id"],
  ["expenses", "insert into expenses (user_id, store, amount, category, spent_on) values ($1,'가게',1000,'식비','2026-11-01') returning id"],
  ["messages", "insert into messages (user_id, role, content) values ($1, 'user', '안녕') returning id"],
  ["usage_logs", "insert into usage_logs (user_id, model, status) values ($1, 'm', 'ok') returning id"],
];

describe.each(tables)("RLS 교차 접근: %s", (table, insert) => {
  it("상대 행은 조회·수정·삭제 모두 0행", async () => {
    const [row] = await withUser(A, (q) => q<{ id: string }>(insert, [A]));
    await withUser(B, (q) => q(insert, [B]));
    expect(await withUser(B, (q) => q(`select 1 from ${table} where id = $1`, [row.id]))).toHaveLength(0);
    expect(await withUser(B, (q) => q(`update ${table} set user_id = user_id where id = $1 returning id`, [row.id]))).toHaveLength(0);
    expect(await withUser(B, (q) => q(`delete from ${table} where id = $1 returning id`, [row.id]))).toHaveLength(0);
    expect(await withUser(A, (q) => q(`select 1 from ${table} where id = $1`, [row.id]))).toHaveLength(1);
  });

  it("남의 user_id로는 삽입할 수 없다", async () => {
    await expect(withUser(A, (q) => q(insert, [B]))).rejects.toThrow();
  });
});

it("사용자 ID를 심지 않으면 아무것도 안 보인다", async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  for (const [t] of tables) expect((await p.query(`select 1 from ${t}`)).rows).toHaveLength(0);
  await p.end();
});

it("auth_user 역할은 앱 테이블을 읽을 수 없다", async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL_AUTH });
  await expect(p.query("select 1 from expenses")).rejects.toThrow(/permission denied/);
  await p.end();
});

it("사용자를 지우면 앱 데이터도 함께 지워진다", async () => {
  const C = await makeUser(owner, "rls-c");
  for (const [, insert] of tables) await withUser(C, (q) => q(insert, [C]));
  await dropUsers(owner, [C]);
  for (const [t] of tables) expect((await owner.query(`select 1 from ${t} where user_id = $1`, [C])).rows).toHaveLength(0);
});
