import { tool } from "ai";
import { z } from "zod";
import { CATEGORIES } from "../categories";
import { withUser } from "../db";
import { deleteExpense, item, patch, saveReceipt, updateExpense } from "../expenses";

export { CATEGORIES } from "../categories";
export { item } from "../expenses";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const notFound = { ok: false, error: "해당 지출을 찾을 수 없어요. list_expenses로 id를 다시 확인한다." } as const;

// 도구 실행이 던진 오류(zod 검증 실패 포함)는 모델에게 되돌아가 다음 단계에서 재시도된다
export const makeTools = (userId: string) => ({
  // 검증과 저장을 한 번에 한다: 작은 모델이 두 번째 호출을 빼먹어도 "저장했다"는 거짓 답이 나오지 않게
  extract_receipt: tool({
    description:
      "영수증·카드 문자에서 읽어낸 항목을 검증하고 지출 장부에 저장한다. 영수증을 받으면 반드시 호출한다. " +
      "raw_text에는 사용자가 보낸 원문을 그대로 넣는다. status가 possible_duplicates이면 저장되지 않은 것이므로 사용자에게 확인한다.",
    inputSchema: z.object({
      raw_text: z.string().max(4000).optional(),
      items: z.array(item).min(1).max(30),
      force: z.boolean().optional().describe("사용자가 중복이 아니라고 확인한 경우에만 true"),
    }),
    execute: (input) => withUser(userId, (q) => saveReceipt(q, userId, input)),
  }),

  list_expenses: tool({
    description: "기간(YYYY-MM-DD)과 분류로 지출 내역을 최대 50건 조회한다. 결과의 id로 수정·삭제한다.",
    inputSchema: z.object({ from: day, to: day, category: z.enum(CATEGORIES).optional() }),
    execute: ({ from, to, category }) =>
      withUser(userId, (q) =>
        q(
          `select id, store, amount, category, spent_on::text as spent_on from expenses
           where spent_on between $1 and $2 and ($3::category is null or category = $3)
           order by spent_on desc, created_at desc limit 50`,
          [from, to, category ?? null],
        ),
      ),
  }),

  update_expense: tool({
    description: "지출 한 건의 가게·금액·분류·날짜 중 바꿀 값만 고친다.",
    inputSchema: z.object({ id: z.uuid(), changes: patch }),
    execute: async ({ id, changes }) => {
      const row = await withUser(userId, (q) => updateExpense(q, id, changes));
      return row ? { ok: true, expense: row } : notFound;
    },
  }),

  delete_expense: tool({
    description: "지출 한 건을 지운다. 사용자가 어떤 항목을 지울지 확인한 뒤에만 호출한다.",
    inputSchema: z.object({ id: z.uuid() }),
    execute: async ({ id }) => {
      const row = await withUser(userId, (q) => deleteExpense(q, id));
      return row ? { ok: true, deleted: row } : notFound;
    },
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

// 응답 텍스트 없이 도구만 실행하고 끝난 경우 대화 기록에 남길 한 줄 요약
export function summarizeToolResults(results: { toolName: string; output: unknown }[]) {
  const lines = results.map(({ toolName, output }) => {
    const o = (output ?? {}) as Record<string, unknown>;
    if (toolName === "extract_receipt") {
      if (o.status === "saved") return `${o.saved}건 저장했어요.`;
      if (o.status === "duplicate") return "이미 저장한 영수증이에요.";
      if (o.status === "possible_duplicates") return "같은 지출이 이미 있어 저장하지 않았어요.";
    }
    if (toolName === "update_expense" && o.ok) return "지출을 고쳤어요.";
    if (toolName === "delete_expense" && o.ok) return "지출을 지웠어요.";
    return null;
  });
  return lines.filter(Boolean).join(" ");
}
