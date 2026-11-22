"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup" | "forgot";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  function go(m: Mode) {
    setMode(m);
    setErr("");
    setDone("");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password") ?? "");
    setBusy(true);
    setErr("");
    setDone("");
    try {
      if (mode === "forgot") {
        // 가입 여부를 드러내지 않도록 결과와 상관없이 같은 안내를 보여준다
        await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        return setDone("가입된 이메일이면 비밀번호 재설정 링크를 보냈어요. 메일함을 확인해 주세요.");
      }
      const { error } =
        mode === "signup"
          ? await authClient.signUp.email({ email, password, name: email.split("@")[0] })
          : await authClient.signIn.email({ email, password });
      if (error) {
        if (error.code === "EMAIL_NOT_VERIFIED") return setErr("이메일 확인이 필요해요. 가입할 때 받은 메일의 링크를 눌러 주세요.");
        return setErr(
          mode === "signup"
            ? "계정을 만들지 못했어요. 이미 있는 이메일이거나 비밀번호가 8자 미만일 수 있어요."
            : "이메일 또는 비밀번호가 맞지 않아요.",
        );
      }
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full border-b border-ink bg-transparent py-2 text-lg outline-none focus-visible:border-blue";
  const label = { signin: "로그인", signup: "계정 만들기", forgot: "재설정 링크 받기" }[mode];
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-5xl font-extrabold tracking-tighter text-blue">Ledgie</h1>
      <p className="mt-3 text-ink-soft">
        {mode === "forgot" ? "가입한 이메일로 비밀번호 재설정 링크를 보내 드려요." : "영수증을 놓으면 장부에 적어 드려요."}
      </p>
      <form key={mode} onSubmit={submit} className="mt-10 space-y-6">
        <label className="block">
          <span className="text-sm text-ink-soft">이메일</span>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
        {mode !== "forgot" && (
          <label className="block">
            <span className="text-sm text-ink-soft">비밀번호</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={input}
            />
          </label>
        )}
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        {done && <p role="status" className="text-sm">{done}</p>}
        <button disabled={busy} className="w-full rounded-[6px] bg-blue py-3 font-semibold text-white disabled:opacity-60">
          {label}
        </button>
      </form>
      <div className="mt-6 flex flex-col items-start gap-3 text-sm text-ink-soft">
        {mode === "signin" ? (
          <>
            <button onClick={() => go("signup")} className="underline underline-offset-4">처음이에요, 계정 만들기</button>
            <button onClick={() => go("forgot")} className="underline underline-offset-4">비밀번호를 잊었어요</button>
          </>
        ) : (
          <button onClick={() => go("signin")} className="underline underline-offset-4">로그인으로 돌아가기</button>
        )}
      </div>
    </main>
  );
}
