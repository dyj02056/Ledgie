import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { Pool } from "pg";

// 인증 테이블은 소유자 연결로 읽는다. app_user에게는 권한을 주지 않는다
const g = globalThis as { __ledgieAuthPool?: Pool };
const pool = (g.__ledgieAuthPool ??= new Pool({ connectionString: process.env.DATABASE_URL_OWNER, max: 3 }));

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()],
});

export async function getUserId(): Promise<string | null> {
  const s = await auth.api.getSession({ headers: await headers() });
  return s?.user.id ?? null;
}
