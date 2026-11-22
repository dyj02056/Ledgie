import { afterAll, expect, it } from "vitest";
import { Client } from "pg";
import { makeTools } from "../lib/agent/tools";

const U = `test-sum-${Date.now()}`;
const owner = new Client({ connectionString: process.env.DATABASE_URL_OWNER });
await owner.connect();
afterAll(async () => {
  await owner.query("delete from receipts where user_id = $1", [U]);
  await owner.end();
});

it("monthly_summary 합계는 저장한 금액의 합과 일치하고 중복 저장은 건너뛴다", async () => {
  const t = makeTools(U);
  const items = [
    { store: "A", amount: 7000, category: "식비" as const, spent_on: "2026-10-03" },
    { store: "B", amount: 2500, category: "식비" as const, spent_on: "2026-10-09" },
    { store: "C", amount: 1250, category: "교통" as const, spent_on: "2026-10-09" },
    { store: "D", amount: 9999, category: "식비" as const, spent_on: "2026-11-01" }, // 다른 달
  ];
  const opt = {} as never;
  const saved = (await t.extract_receipt.execute!({ items }, opt)) as { saved: number };
  expect(saved.saved).toBe(4);
  const s = (await t.monthly_summary.execute!({ month: "2026-10" }, opt)) as {
    total: number;
    by_category: { category: string; total: number }[];
  };
  expect(s.total).toBe(10750);
  expect(s.by_category.find((c) => c.category === "식비")?.total).toBe(9500);
});
