"use client";
import { useEffect, useState } from "react";
import { won } from "@/lib/money";

export type Row = { id: string; spent_on: string; store: string; category: string; amount: number };

// 새로 들어온 행(처음 보는 id)에만 형광펜 효과를 준다. 처음 화면을 열 때는 효과 없음
export default function Rows({ rows }: { rows: Row[] }) {
  const [seen, setSeen] = useState(() => new Set(rows.map((r) => r.id)));
  useEffect(() => {
    const t = setTimeout(() => setSeen(new Set(rows.map((r) => r.id))), 1200);
    return () => clearTimeout(t);
  }, [rows]);

  if (!rows.length)
    return <p className="py-10 text-ink-soft">영수증 사진이나 카드 문자를 오른쪽 입력창에 붙여넣으세요.</p>;
  return (
    <table className="w-full text-left">
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={`border-b border-rule ${seen.has(r.id) ? "" : "fresh"}`}>
            <td className="w-20 py-2.5 pr-3 text-ink-soft">{r.spent_on.slice(5).replace("-", "/")}</td>
            <td className="py-2.5 pr-3">{r.store}</td>
            <td className="py-2.5 pr-3 text-ink-soft">{r.category}</td>
            <td className="py-2.5 text-right font-semibold">{won(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
