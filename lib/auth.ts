import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Pool } from "pg";
import { sendMail } from "./mail";

// 인증 테이블은 auth_user 역할로만 읽고 쓴다. 이 역할은 앱 테이블 권한이 없다
const g = globalThis as { __ledgieAuthPool?: Pool };
const pool = (g.__ledgieAuthPool ??= new Pool({ connectionString: process.env.DATABASE_URL_AUTH, max: 3 }));

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    // 켜면 인증 메일을 확인하기 전에는 로그인할 수 없다. 메일 발송을 설정한 뒤에 켠다
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === "true",
    sendResetPassword: ({ user, url }) =>
      sendMail({ to: user.email, subject: "Ledgie 비밀번호 재설정", text: `아래 링크에서 새 비밀번호를 정하세요. 1시간 동안 유효해요.\n${url}` }),
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) =>
      sendMail({ to: user.email, subject: "Ledgie 이메일 확인", text: `아래 링크를 눌러 이메일 주소를 확인하세요.\n${url}` }),
  },
  // 사용자 행을 지우면 앱 데이터는 FK(on delete cascade)로 함께 지워진다
  user: { deleteUser: { enabled: true } },
  plugins: [nextCookies()],
});

export async function getUserId(): Promise<string | null> {
  const s = await auth.api.getSession({ headers: await headers() });
  return s?.user.id ?? null;
}

// 페이지용: 세션이 없거나 만료됐으면 로그인 화면으로 보낸다
export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) redirect("/login");
  return id;
}
