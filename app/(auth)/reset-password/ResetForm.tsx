"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const newPassword = String(f.get("password"));
    if (newPassword !== String(f.get("confirm"))) return setErr("두 비밀번호가 달라요.");
    setBusy(true);
    setErr("");
    const { error } = await authClient.resetPassword({ newPassword, token });
    setBusy(false);
    if (error) return setErr("비밀번호를 바꾸지 못했어요. 링크가 만료됐을 수 있어요.");
    router.push("/login");
  }

  const input = "w-full border-b border-ink bg-transparent py-2 text-lg outline-none focus-visible:border-blue";
  return (
    <form onSubmit={submit} className="mt-10 space-y-6">
      <label className="block">
        <span className="text-sm text-ink-soft">새 비밀번호 (8자 이상)</span>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      <label className="block">
        <span className="text-sm text-ink-soft">한 번 더</span>
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={input} />
      </label>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <button disabled={busy} className="w-full rounded-[6px] bg-blue py-3 font-semibold text-white disabled:opacity-60">
        비밀번호 바꾸기
      </button>
    </form>
  );
}
