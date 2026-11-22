import Link from "next/link";
import ResetForm from "./ResetForm";

// 메일의 링크가 /api/auth/reset-password/:token을 거쳐 ?token=…(실패 시 ?error=…)으로 돌아온다
export default async function ResetPassword(props: PageProps<"/reset-password">) {
  const sp = await props.searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-3xl font-extrabold tracking-tighter text-blue">새 비밀번호</h1>
      {token && !sp.error ? (
        <ResetForm token={token} />
      ) : (
        <p role="alert" className="mt-6 text-danger">
          링크가 만료됐거나 올바르지 않아요.{" "}
          <Link href="/login" className="underline underline-offset-4">다시 요청하기</Link>
        </p>
      )}
    </main>
  );
}
