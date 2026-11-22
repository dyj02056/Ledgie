import { createHash } from "node:crypto";
import { z } from "zod";
import { CATEGORIES } from "./categories";
import type { Q } from "./db";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)), "존재하지 않는 날짜");

export const item = z.object({
  store: z.string().trim().min(1).max(80),
  amount: z.number().int().positive().max(1_000_000_000),
  category: z.enum(CATEGORIES),
  spent_on: date,
});
export type Item = z.infer<typeof item>;

export const patch = item.partial().refine((p) => Object.values(p).some((v) => v !== undefined), "바꿀 값이 없어요");
export type Patch = z.infer<typeof patch>;

// 공백·줄바꿈 차이는 같은 원문으로 본다
export const sourceHash = (raw: string) => createHash("sha256").update(raw.replace(/\s+/g, " ").trim()).digest("hex");

export type SaveResult =
  | { status: "saved"; saved: number; total: number }
  | { status: "duplicate"; saved: 0; message: string }
  | { status: "possible_duplicates"; saved: 0; matches: (Item & { id: string })[]; message: string };

// 같은 원문은 무조건 건너뛰고, 원문이 달라도 (가게, 금액, 날짜)가 같은 기존 행이 있으면 force 없이는 저장하지 않는다
export async function saveReceipt(
  q: Q,
  userId: string,
  { raw_text, items, force = false }: { raw_text?: string; items: Item[]; force?: boolean },
): Promise<SaveResult> {
  const hash = raw_text?.trim() ? sourceHash(raw_text) : null;
  if (hash && !force) {
    const [dup] = await q("select 1 from receipts where source_hash = $1", [hash]);
    if (dup) return { status: "duplicate", saved: 0, message: "이미 저장한 영수증이에요." };
  }
  if (!force) {
    const matches = await q<Item & { id: string }>(
      `select e.id, e.store, e.amount, e.category, e.spent_on::text as spent_on
       from expenses e join jsonb_to_recordset($1::jsonb) as i(store text, amount int, spent_on date)
         on e.store = i.store and e.amount = i.amount and e.spent_on = i.spent_on`,
      [JSON.stringify(items)],
    );
    if (matches.length)
      return {
        status: "possible_duplicates",
        saved: 0,
        matches,
        message: "같은 가게·금액·날짜의 지출이 이미 있어요. 사용자에게 새 지출이 맞는지 물은 뒤, 맞다고 하면 force: true로 다시 호출한다.",
      };
  }
  // force로 다시 저장하는 원문은 해시를 남기지 않는다(유일 제약에 걸리지 않게)
  const [r] = await q<{ id: string }>(
    "insert into receipts (user_id, raw_text, extracted, source_hash) values ($1,$2,$3,$4) returning id",
    [userId, raw_text ?? null, JSON.stringify(items), force ? null : hash],
  );
  await q(
    `insert into expenses (user_id, receipt_id, store, amount, category, spent_on)
     select $1, $2, i.store, i.amount, i.category::category, i.spent_on
     from jsonb_to_recordset($3::jsonb) as i(store text, amount int, category text, spent_on date)`,
    [userId, r.id, JSON.stringify(items)],
  );
  return { status: "saved", saved: items.length, total: items.reduce((s, i) => s + i.amount, 0) };
}

export async function updateExpense(q: Q, id: string, p: Patch) {
  const [row] = await q<Item & { id: string }>(
    `update expenses set store = coalesce($2, store), amount = coalesce($3, amount),
       category = coalesce($4::category, category), spent_on = coalesce($5::date, spent_on)
     where id = $1 returning id, store, amount, category, spent_on::text as spent_on`,
    [id, p.store ?? null, p.amount ?? null, p.category ?? null, p.spent_on ?? null],
  );
  return row ?? null;
}

export async function deleteExpense(q: Q, id: string) {
  const [row] = await q<Item & { id: string }>(
    "delete from expenses where id = $1 returning id, store, amount, category, spent_on::text as spent_on",
    [id],
  );
  return row ?? null;
}
