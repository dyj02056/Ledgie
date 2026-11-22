import { tool } from "ai";
import { z } from "zod";
import { withUser } from "../db";

export const CATEGORIES = ["식비", "교통", "주거", "쇼핑", "의료", "문화", "기타"] as const;

export const item = z.object({
  store: z.string().min(1).max(80),
  amount: z.number().int().positive(),
  category: z.enum(CATEGORIES),
  spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)), "존재하지 않는 날짜"),
});
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

// 도구 실행이 던진 오류(zod 검증 실패 포함)는 모델에게 되돌아가 다음 단계에서 재시도된다
export const makeTools = (userId: string) => ({
  // 검증과 저장을 한 번에 한다: 작은 모델이 두 번째 호출을 빼먹어도 "저장했다"는 거짓 답이 나오지 않게
  extract_receipt: tool({
    description: "영수증·카드 문자에서 읽어낸 항목을 검증하고 지출 장부에 저장한다. 영수증을 받으면 반드시 호출한다.",
    inputSchema: z.object({ raw_text: z.string().max(4000).optional(), items: z.array(item).min(1).max(30) }),
    execute: ({ raw_text, items }) =>
      withUser(userId, async (q) => {
        const [r] = await q<{ id: string }>(
          "insert into receipts (user_id, raw_text, extracted) values ($1,$2,$3) returning id",
          [userId, raw_text ?? null, JSON.stringify(items)],
        );
        let saved = 0;
        for (const i of items) {
          const ins = await q(
            `insert into expenses (user_id, receipt_id, store, amount, category, spent_on)
             values ($1,$2,$3,$4,$5,$6) on conflict do nothing returning id`,
            [userId, r.id, i.store, i.amount, i.category, i.spent_on],
          );
          saved += ins.length;
        }
        return { saved, skipped: items.length - saved, total: items.reduce((s, i) => s + i.amount, 0) };
      }),
  }),

  list_expenses: tool({
    description: "기간(YYYY-MM-DD)과 분류로 지출 내역을 최대 50건 조회한다.",
    inputSchema: z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      category: z.enum(CATEGORIES).optional(),
    }),
    execute: ({ from, to, category }) =>
      withUser(userId, (q) =>
        q(
          `select store, amount, category, spent_on::text as spent_on from expenses
           where spent_on between $1 and $2 and ($3::category is null or category = $3)
           order by spent_on desc limit 50`,
          [from, to, category ?? null],
        ),
      ),
  }),

  monthly_summary: tool({
    description: "월(YYYY-MM)별 분류 합계와 전체 합계를 구한다. 금액 질문에는 반드시 이 도구 결과만 쓴다.",
    inputSchema: z.object({ month }),
    execute: ({ month }) =>
      withUser(userId, async (q) => {
        // 합계는 DB가 계산한다. 모델이 직접 더하지 않는다
        const rows = await q<{ category: string; total: number; n: number }>(
          `select category, sum(amount)::int as total, count(*)::int as n from expenses
           where spent_on >= $1::date and spent_on < ($1::date + interval '1 month')
           group by category order by total desc`,
          [`${month}-01`],
        );
        return { month, total: rows.reduce((s, r) => s + r.total, 0), by_category: rows };
      }),
  }),
});
