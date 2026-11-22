import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import SignOut from "./SignOut";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // 로그인하지 않은 요청은 여기서 막는다. 데이터는 RLS가 한 번 더 막는다
  if (!(await getUserId())) redirect("/login");
  return (
    <>
      <header className="mx-auto flex max-w-6xl items-baseline gap-6 px-5 pt-5">
        <Link href="/" className="text-xl font-extrabold tracking-tighter text-blue">Ledgie</Link>
        <nav className="flex gap-4 text-sm text-ink-soft">
          <Link href="/" className="hover:text-ink">장부</Link>
          <Link href="/receipts" className="hover:text-ink">영수증</Link>
          <Link href="/usage" className="hover:text-ink">사용량</Link>
        </nav>
        <SignOut />
      </header>
      {children}
    </>
  );
}
