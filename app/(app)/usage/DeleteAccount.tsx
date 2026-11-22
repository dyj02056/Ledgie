"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

// 비밀번호를 다시 확인한 뒤 계정과 모든 지출·영수증·대화 기록을 지운다
export default function DeleteAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    setBusy(true);
    setErr("");
    const { error } = await authClient.deleteUser({ password });
    setBusy(false);
    if (error) return setErr("비밀번호가 맞지 않아요.");
    router.push("/login");
    router.refresh();
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-danger underline underline-offset-4">
        계정 삭제
      </button>
    );
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-danger pt-4">
      <p className="text-sm">계정과 모든 지출·영수증·대화 기록이 지워지고 되돌릴 수 없어요.</p>
      <input
        name="password"
        type="password"
        required
        autoComplete="current-password"
        aria-label="비밀번호 확인"
        placeholder="비밀번호 확인"
        className="w-full rounded-[6px] border border-rule bg-white px-3 py-2 outline-none focus-visible:border-blue"
      />
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex gap-3">
        <button disabled={busy} className="rounded-[6px] bg-danger px-4 py-1.5 font-semibold text-white disabled:opacity-60">
          영구 삭제
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-soft underline underline-offset-4">
          취소
        </button>
      </div>
    </form>
  );
}
