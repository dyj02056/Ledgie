import { afterAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { withUser } from "../lib/db";

const A = `test-a-${Date.now()}`;
const B = `test-b-${Date.now()}`;
const owner = new Client({ connectionString: process.env.DATABASE_URL_OWNER });
await owner.connect();

const add = (u: string) =>
  withUser(u, (q) =>
    q("insert into expenses (user_id, store, amount, category, spent_on) values ($1,'가게',1000,'식비','2026-11-01') returning id", [u]),
  );

afterAll(async () => {
  await owner.query("delete from expenses where user_id = any($1)", [[A, B]]);
  await owner.end();
});

describe("RLS 교차 접근", () => {
  it("상대 데이터는 조회·수정·삭제 모두 0행", async () => {
    const [row] = await add(A);
    await add(B);
    expect(await withUser(B, (q) => q("select 1 from expenses where id = $1", [row.id]))).toHaveLength(0);
    expect(await withUser(B, (q) => q("update expenses set amount = 1 where id = $1 returning id", [row.id]))).toHaveLength(0);
    expect(await withUser(B, (q) => q("delete from expenses where id = $1 returning id", [row.id]))).toHaveLength(0);
    expect(await withUser(A, (q) => q("select 1 from expenses where id = $1", [row.id]))).toHaveLength(1);
  });

  it("남의 user_id로는 삽입할 수 없다", async () => {
    await expect(
      withUser(A, (q) => q("insert into expenses (user_id, store, amount, category, spent_on) values ($1,'x',1,'기타','2026-11-01')", [B])),
    ).rejects.toThrow();
  });

  it("사용자 ID를 심지 않으면 아무것도 안 보인다", async () => {
    const { Pool } = await import("pg");
    const p = new Pool({ connectionString: process.env.DATABASE_URL });
    const r = await p.query("select 1 from expenses");
    await p.end();
    expect(r.rows).toHaveLength(0);
  });
});
