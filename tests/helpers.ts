import { Client } from "pg";

// 앱 테이블의 user_id가 "user"를 참조하므로 테스트 사용자를 먼저 만든다. 지우면 앱 데이터도 cascade로 지워진다
export async function ownerClient() {
  const c = new Client({ connectionString: process.env.DATABASE_URL_OWNER });
  await c.connect();
  return c;
}

let seq = 0;
export async function makeUser(owner: Client, prefix: string) {
  const id = `test-${prefix}-${Date.now()}-${seq++}`;
  await owner.query(`insert into "user" (id, name, email) values ($1, $1, $1 || '@ledgie.test')`, [id]);
  return id;
}

export const dropUsers = (owner: Client, ids: string[]) => owner.query(`delete from "user" where id = any($1)`, [ids]);
