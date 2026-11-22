"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function Login() {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    setBusy(true);
    setErr("");
    const { error } = signup
      ? await authClient.signUp.email({ email, password, name: email.split("@")[0] })
      : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) return setErr(signup ? "계정을 만들지 못했어요. 이미 있는 이메일이거나 비밀번호가 8자 미만일 수 있어요." : "이메일 또는 비밀번호가 맞지 않아요.");
    router.push("/");
    router.refresh();
  }

  const input = "w-full border-b border-ink bg-transparent py-2 text-lg outline-none focus-visible:border-blue";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-5xl font-extrabold tracking-tighter text-blue">Ledgie</h1>
      <p className="mt-3 text-ink-soft">영수증을 놓으면 장부에 적어 드려요.</p>
      <form onSubmit={submit} className="mt-10 space-y-6">
        <label className="block">
          <span className="text-sm text-ink-soft">이메일</span>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">비밀번호</span>
          <input name="password" type="password" required minLength={8} autoComplete={signup ? "new-password" : "current-password"} className={input} />
        </label>
        {err && <p role="alert" className="text-sm text-[#a3261c]">{err}</p>}
        <button disabled={busy} className="w-full rounded-[6px] bg-blue py-3 font-semibold text-white disabled:opacity-60">
          {signup ? "계정 만들기" : "로그인"}
        </button>
      </form>
      <button onClick={() => setSignup(!signup)} className="mt-6 self-start text-sm text-ink-soft underline underline-offset-4">
        {signup ? "이미 계정이 있어요" : "처음이에요, 계정 만들기"}
      </button>
    </main>
  );
}
