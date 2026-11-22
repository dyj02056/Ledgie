"use client";
import { useEffect, useState, useTransition } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { won } from "@/lib/money";
import { editExpense, removeExpense } from "./actions";

export type Row = { id: string; spent_on: string; store: string; category: string; amount: number };

const field = "rounded-[6px] border border-rule bg-white px-2 py-1 outline-none focus-visible:border-blue";

function EditRow({ row, onDone }: { row: Row; onDone: () => void }) {
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const changes = {
      spent_on: String(f.get("spent_on")),
      store: String(f.get("store")).trim(),
      category: String(f.get("category")) as Category,
      amount: Number(f.get("amount")),
    };
    start(async () => {
      const r = await editExpense(row.id, changes);
      if (r.error) setErr(r.error);
      else onDone();
    });
  }

  return (
    <tr className="border-b border-rule">
      <td colSpan={5} className="py-2.5">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-sm">
          <input name="spent_on" type="date" required defaultValue={row.spent_on} aria-label="날짜" className={field} />
          <input name="store" required maxLength={80} defaultValue={row.store} aria-label="가게" className={`${field} order-first w-full min-w-0 sm:order-none sm:w-auto sm:flex-1`} />
          <select name="category" defaultValue={row.category} aria-label="분류" className={field}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input name="amount" type="number" required min={1} step={1} defaultValue={row.amount} aria-label="금액" className={`${field} w-28 text-right`} />
          <button disabled={pending} className="rounded-[6px] bg-blue px-3 py-1 font-semibold text-white disabled:opacity-60">
            저장
          </button>
          <button type="button" onClick={onDone} className="text-ink-soft underline underline-offset-2">
            취소
          </button>
          {err && <p role="alert" className="w-full text-danger">{err}</p>}
        </form>
      </td>
    </tr>
  );
}

// 새로 들어온 행(처음 보는 id)에만 형광펜 효과를 준다. 처음 화면을 열 때는 효과 없음
export default function Rows({ rows }: { rows: Row[] }) {
  const [seen, setSeen] = useState(() => new Set(rows.map((r) => r.id)));
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => {
    const t = setTimeout(() => setSeen(new Set(rows.map((r) => r.id))), 1200);
    return () => clearTimeout(t);
  }, [rows]);

  function remove(r: Row) {
    if (!confirm(`${r.store} ${won(r.amount)} 지출을 지울까요? 되돌릴 수 없어요.`)) return;
    setErr("");
    start(async () => {
      const res = await removeExpense(r.id);
      if (res.error) setErr(res.error);
    });
  }

  if (!rows.length)
    return <p className="py-10 text-ink-soft">영수증 사진이나 카드 문자를 오른쪽 입력창에 붙여넣으세요.</p>;
  return (
    <>
      {err && <p role="alert" className="pt-2 text-sm text-danger">{err}</p>}
      <table className="w-full text-left">
        <tbody>
          {rows.map((r) =>
            editing === r.id ? (
              <EditRow key={r.id} row={r} onDone={() => setEditing(null)} />
            ) : (
              <tr key={r.id} className={`group border-b border-rule ${seen.has(r.id) ? "" : "fresh"}`}>
                <td className="w-14 whitespace-nowrap py-2.5 pr-3 align-top text-ink-soft sm:w-20 sm:align-middle">
                  {r.spent_on.slice(5).replace("-", "/")}
                </td>
                {/* 좁은 화면에서는 분류를 가게 이름 아래로 내린다 */}
                <td className="break-keep py-2.5 pr-3">
                  {r.store}
                  <span className="block text-sm text-ink-soft sm:hidden">{r.category}</span>
                </td>
                <td className="hidden whitespace-nowrap py-2.5 pr-3 text-ink-soft sm:table-cell">{r.category}</td>
                <td className="whitespace-nowrap py-2.5 text-right align-top font-semibold sm:align-middle">{won(r.amount)}</td>
                <td className="whitespace-nowrap py-2.5 pl-3 text-right align-top text-sm text-ink-soft sm:w-24 sm:align-middle">
                  <button onClick={() => setEditing(r.id)} aria-label={`${r.store} 수정`} className="hover:text-ink">
                    수정
                  </button>
                  <button
                    onClick={() => remove(r)}
                    disabled={pending}
                    aria-label={`${r.store} 삭제`}
                    className="ml-3 hover:text-danger disabled:opacity-60"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </>
  );
}
