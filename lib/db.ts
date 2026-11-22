import { Pool, type QueryResultRow } from "pg";

// dev 서버의 핫 리로드마다 풀이 늘지 않게 전역에 하나만 둔다
const g = globalThis as { __ledgiePool?: Pool };
const pool = (g.__ledgiePool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }));

export type Q = <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<R[]>;

// 요청마다 사용자 ID를 심고 같은 트랜잭션에서만 쿼리한다
// RLS가 최종 방어선이므로 앱단에서 user_id 필터를 따로 두지 않는다
export async function withUser<T>(userId: string, fn: (q: Q) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.user_id', $1, true)", [userId]);
    const out = await fn(async (sql, params) => (await c.query(sql, params)).rows);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
