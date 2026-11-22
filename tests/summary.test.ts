import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { makeTools } from "../lib/agent/tools";
import { withUser } from "../lib/db";
import { dropUsers, makeUser, ownerClient } from "./helpers";

let owner: Client;
let U = "";
let t: ReturnType<typeof makeTools>;
const opt = {} as never;
beforeAll(async () => {
  owner = await ownerClient();
  U = await makeUser(owner, "sum");
  t = makeTools(U);
});
afterAll(async () => {
  await dropUsers(owner, [U]);
  await owner.end();
});

type Saved = { status: string; saved: number; matches?: { id: string }[] };
const save = async (input: Parameters<NonNullable<typeof t.extract_receipt.execute>>[0]) =>
  (await t.extract_receipt.execute!(input, opt)) as Saved;
const count = () => withUser(U, (q) => q<{ n: number }>("select count(*)::int as n from expenses")).then(([r]) => r.n);

describe("저장과 합계", () => {
  it("monthly_summary 합계는 저장한 금액의 합과 일치하고, 같은 영수증의 동일 항목도 모두 저장한다", async () => {
    const items = [
      { store: "A", amount: 7000, category: "식비" as const, spent_on: "2026-10-03" },
      { store: "A", amount: 7000, category: "식비" as const, spent_on: "2026-10-03" }, // 같은 영수증의 같은 항목
      { store: "B", amount: 2500, category: "식비" as const, spent_on: "2026-10-09" },
      { store: "C", amount: 1250, category: "교통" as const, spent_on: "2026-10-09" },
      { store: "D", amount: 9999, category: "식비" as const, spent_on: "2026-11-01" }, // 다른 달
    ];
    expect((await save({ items })).saved).toBe(5);
    const s = (await t.monthly_summary.execute!({ month: "2026-10" }, opt)) as {
      total: number;
      by_category: { category: string; total: number }[];
    };
    expect(s.total).toBe(17750);
    expect(s.by_category.find((c) => c.category === "식비")?.total).toBe(16500);
  });
});

describe("중복 저장", () => {
  const sms = "[KB카드] 승인 중복테스트 4,300원 2026-09-01";
  const items = [{ store: "중복테스트", amount: 4300, category: "식비" as const, spent_on: "2026-09-01" }];

  it("같은 원문을 두 번 넣으면 두 번째는 duplicate로 건너뛴다(공백 차이 무시)", async () => {
    expect((await save({ raw_text: sms, items })).status).toBe("saved");
    const before = await count();
    expect((await save({ raw_text: `  ${sms.replace(" ", "\n")} `, items })).status).toBe("duplicate");
    expect(await count()).toBe(before);
  });

  it("원문이 달라도 같은 가게·금액·날짜가 있으면 저장하지 않고 확인을 요구한다", async () => {
    const before = await count();
    const r = await save({ items });
    expect(r.status).toBe("possible_duplicates");
    expect(r.matches).toHaveLength(1);
    expect(await count()).toBe(before);
  });

  it("사용자가 확인하면 force로 저장된다", async () => {
    const before = await count();
    expect((await save({ items, force: true })).status).toBe("saved");
    expect(await count()).toBe(before + 1);
  });
});

describe("수정과 삭제", () => {
  it("update_expense와 delete_expense는 본인 행만 바꾼다", async () => {
    const rows = (await t.list_expenses.execute!({ from: "2026-10-01", to: "2026-10-31", category: "교통" }, opt)) as { id: string }[];
    const id = rows[0].id;
    const up = (await t.update_expense.execute!({ id, changes: { amount: 1300, category: "기타" } }, opt)) as {
      ok: boolean;
      expense: { amount: number; category: string; store: string };
    };
    expect(up).toMatchObject({ ok: true, expense: { amount: 1300, category: "기타", store: "C" } });

    // 다른 사용자의 도구로는 찾을 수 없다
    const other = await makeUser(owner, "sum-other");
    try {
      const res = (await makeTools(other).delete_expense.execute!({ id }, opt)) as { ok: boolean };
      expect(res.ok).toBe(false);
    } finally {
      await dropUsers(owner, [other]);
    }

    expect(((await t.delete_expense.execute!({ id }, opt)) as { ok: boolean }).ok).toBe(true);
    expect(((await t.delete_expense.execute!({ id }, opt)) as { ok: boolean }).ok).toBe(false);
  });
});
