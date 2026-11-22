import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { classify } from "@/lib/agent/classify";
import { NoVisionError, pickModel } from "@/lib/agent/model";
import { CATEGORIES, makeTools } from "@/lib/agent/tools";
import { todayKST } from "@/lib/money";

export const maxDuration = 60;

const body = z.object({ messages: z.array(z.any()).min(1).max(40) });
const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
const fail = (msg: string, status: number) => Response.json({ error: msg }, { status });

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return fail("로그인이 필요해요.", 401);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("요청 형식이 올바르지 않아요.", 400);
  const messages = parsed.data.messages as UIMessage[];
  const last = messages[messages.length - 1];
  if (last.role !== "user") return fail("마지막 메시지는 사용자 메시지여야 해요.", 400);

  // 일일 호출 상한
  const limit = Number(process.env.DAILY_CALL_LIMIT ?? 50);
  const [{ n }] = await withUser(userId, (q) =>
    q<{ n: number }>("select count(*)::int as n from usage_logs where created_at > now() - interval '1 day'"),
  );
  if (n >= limit) return fail("오늘 사용할 수 있는 횟수를 모두 썼어요. 내일 다시 시도해 주세요.", 429);

  const kind = classify(last);
  let picked;
  try {
    picked = pickModel(kind);
  } catch (e) {
    if (e instanceof NoVisionError) return fail(e.message, 422);
    throw e;
  }

  const started = Date.now();
  const log = (ok: boolean, usage?: { inputTokens?: number; outputTokens?: number }) =>
    withUser(userId, (q) =>
      q("insert into usage_logs (user_id, model, input_tokens, output_tokens, latency_ms, ok) values ($1,$2,$3,$4,$5,$6)", [
        userId, picked.id, usage?.inputTokens ?? null, usage?.outputTokens ?? null, Date.now() - started, ok,
      ]),
    ).catch(() => {}); // 기록 실패가 응답을 막지 않게 한다

  const result = streamText({
    model: picked.model,
    instructions: `너는 가계부 도우미 Ledgie다. 오늘은 ${todayKST()}(한국 시간)이다.
- 영수증이나 카드 문자를 받으면 항목(store, amount, category, spent_on)을 읽어 extract_receipt를 호출한다. 이 도구가 검증과 저장을 함께 하며, 결과(saved, skipped)를 한두 문장으로 알려준다. 도구를 호출하지 않고 저장했다고 말하지 않는다.
- 분류는 ${CATEGORIES.join(", ")} 중 하나다. 날짜가 없으면 오늘 날짜를 쓴다. 금액은 원 단위 정수다.
- 카드번호·계좌번호는 다루지 않는다.
- 금액이나 합계를 묻는 질문은 monthly_summary 또는 list_expenses 결과만 근거로 답하고, 직접 계산하지 않는다.
- 답은 한국어 평어체로 짧게 쓴다.`,
    messages: await convertToModelMessages(messages),
    tools: makeTools(userId),
    stopWhen: isStepCount(6),
    onEnd: async ({ usage, text }) => {
      await log(true, usage);
      await withUser(userId, async (q) => {
        const u = textOf(last);
        if (u) await q("insert into messages (user_id, role, content) values ($1,'user',$2)", [userId, u]);
        if (text) await q("insert into messages (user_id, role, content) values ($1,'assistant',$2)", [userId, text]);
      }).catch(() => {});
    },
    onError: () => void log(false),
  });

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}
