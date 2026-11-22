import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { monthKST, won } from "@/lib/money";
import type { UIMessage } from "ai";
import Chat from "./Chat";
import Rows, { type Row } from "./Rows";

const shift = (m: string, d: number) => {
  const [y, mo] = m.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

const RANGE = "spent_on >= $1::date and spent_on < ($1::date + interval '1 month')";

export default async function Ledger(props: PageProps<"/">) {
  const userId = (await getUserId())!; // 레이아웃이 이미 로그인을 확인했다
  const sp = await props.searchParams;
  const raw = typeof sp.m === "string" ? sp.m : "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : monthKST();

  const { rows, cats, history } = await withUser(userId, async (q) => ({
    rows: await q<Row>(
      `select id, spent_on::text as spent_on, store, category, amount from expenses
       where ${RANGE} order by spent_on desc, created_at desc`,
      [`${month}-01`],
    ),
    cats: await q<{ category: string; total: number }>(
      `select category, sum(amount)::int as total from expenses where ${RANGE} group by category order by total desc`,
      [`${month}-01`],
    ),
    history: await q<{ id: string; role: "user" | "assistant"; content: string }>(
      "select id, role, content from (select * from messages order by created_at desc limit 20) m order by created_at",
    ),
  }));

  const total = cats.reduce((s, c) => s + c.total, 0);
  const max = Math.max(1, ...cats.map((c) => c.total));
  const initial: UIMessage[] = history.map((h) => ({ id: h.id, role: h.role, parts: [{ type: "text", text: h.content }] }));

  return (
    <main className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-5 pb-16 pt-8 lg:grid-cols-[1fr_22rem]">
      <div>
        <div className="flex items-baseline gap-4">
          <h1 className="text-2xl font-bold">{Number(month.slice(5))}월</h1>
          <span className="text-sm text-ink-soft">{month.slice(0, 4)}년</span>
          <Link href={`/?m=${shift(month, -1)}`} className="ml-auto text-sm text-ink-soft hover:text-ink">
            이전 달
          </Link>
          <Link href={`/?m=${shift(month, 1)}`} className="text-sm text-ink-soft hover:text-ink">
            다음 달
          </Link>
        </div>
        <p className="mt-2 text-[clamp(3rem,9vw,6.5rem)] font-extrabold leading-none tracking-tighter text-blue">
          {won(total)}
        </p>

        {cats.length > 0 && (
          <ul className="mt-8 space-y-2">
            {cats.map((c) => (
              <li key={c.category} className="grid grid-cols-[4rem_1fr_7rem] items-center gap-3 text-sm">
                <span>{c.category}</span>
                {/* 분류별 합계는 괘선의 길이로 보여준다 */}
                <span className="h-0.5 bg-ink" style={{ width: `${(c.total / max) * 100}%` }} />
                <span className="text-right">{won(c.total)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 border-t border-ink">
          <Rows rows={rows} />
        </div>
      </div>
      <aside className="lg:border-l lg:border-rule lg:pl-8">
        <Chat initial={initial} />
      </aside>
    </main>
  );
}
