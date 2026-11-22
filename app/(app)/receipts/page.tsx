import { requireUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { won } from "@/lib/money";

type Item = { store: string; amount: number; category: string; spent_on: string };
type R = { id: string; created_at: string; raw_text: string | null; items: Item[] | null; saved: number };

export default async function Receipts() {
  const userId = await requireUserId();
  const rs = await withUser(userId, (q) =>
    q<R>(
      `select r.id, to_char(r.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as created_at,
              r.raw_text, r.extracted as items, (select count(*)::int from expenses e where e.receipt_id = r.id) as saved
       from receipts r order by r.created_at desc limit 50`,
    ),
  );
  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-8">
      <h1 className="text-2xl font-bold">영수증</h1>
      {!rs.length && (
        <p className="mt-6 text-ink-soft">아직 올린 영수증이 없어요. 장부 화면에서 영수증을 놓아 보세요.</p>
      )}
      <ul className="mt-6 divide-y divide-rule border-y border-ink">
        {rs.map((r) => (
          <li key={r.id} className="py-4">
            <p className="text-sm text-ink-soft">
              {r.created_at} · {r.saved ? `${r.saved}건 저장` : "저장 전"}
            </p>
            {r.raw_text && <p className="mt-1 whitespace-pre-wrap text-ink-soft">{r.raw_text}</p>}
            <ul className="mt-2">
              {r.items?.map((i, n) => (
                <li key={n} className="flex gap-3">
                  <span className="w-14 text-ink-soft">{i.spent_on.slice(5).replace("-", "/")}</span>
                  <span className="flex-1">
                    {i.store} <span className="text-ink-soft">{i.category}</span>
                  </span>
                  <span className="font-semibold">{won(i.amount)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </main>
  );
}
