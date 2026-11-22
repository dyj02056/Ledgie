import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { hasImage } from "@/lib/agent/classify";
import { NoVisionError, pickModel } from "@/lib/agent/model";
import { CATEGORIES, makeTools, summarizeToolResults } from "@/lib/agent/tools";
import { MAX_IMAGE_BYTES } from "@/lib/limits";
import { todayKST } from "@/lib/money";

export const maxDuration = 60;

const HISTORY = 20;

// 클라이언트는 새 사용자 메시지 하나만 보낸다. 이전 대화는 서버가 DB에서 읽는다
const part = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(4000) }),
  z.object({
    type: z.literal("file"),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    url: z.string().startsWith("data:image/"),
    filename: z.string().max(200).optional(),
  }),
]);
const body = z.object({
  // 다시 시도: 이미 기록된 같은 사용자 메시지를 또 남기지 않는다
  retry: z.boolean().optional(),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z.array(part).min(1).max(5).refine((ps) => ps.filter((p) => p.type === "file").length <= 1, "이미지는 한 장만"),
  }),
});

const textOf = (m: Pick<UIMessage, "parts">) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
const fail = (msg: string, status: number) => Response.json({ error: msg }, { status });
// base64 길이로 원본 바이트 수를 계산한다
const dataUrlBytes = (url: string) => Math.floor((url.length - url.indexOf(",") - 1) * 0.75);

// 한국 날짜 기준 오늘 0시
const TODAY_KST = "(date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')";

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return fail("로그인이 필요해요.", 401);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("요청 형식이 올바르지 않아요.", 400);
  const message = parsed.data.message as UIMessage;
  for (const p of message.parts)
    if (p.type === "file" && dataUrlBytes(p.url) > MAX_IMAGE_BYTES) return fail("3MB 이하 이미지만 올릴 수 있어요.", 413);
  const text = textOf(message);
  const image = hasImage(message);
  if (!text && !image) return fail("내용이 비어 있어요.", 400);

  let picked;
  try {
    picked = pickModel(image);
  } catch (e) {
    if (e instanceof NoVisionError) return fail(e.message, 422);
    throw e;
  }

  // 일일 상한: 사용자별 잠금 안에서 세고 바로 pending 행을 넣는다. 동시 요청도 상한을 넘지 못한다
  const limit = Number(process.env.DAILY_CALL_LIMIT ?? 50);
  const started = await withUser(userId, async (q) => {
    await q("select pg_advisory_xact_lock(hashtext($1))", [userId]);
    const [{ n }] = await q<{ n: number }>(`select count(*)::int as n from usage_logs where created_at >= ${TODAY_KST}`);
    if (n >= limit) return null;
    const [log] = await q<{ id: string }>(
      "insert into usage_logs (user_id, model, status) values ($1,$2,'pending') returning id",
      [userId, picked.id],
    );
    const history = await q<{ id: string; role: "user" | "assistant"; content: string }>(
      `select id, role, content from (select * from messages order by created_at desc limit ${HISTORY}) m order by created_at`,
    );
    // 사용자 메시지는 먼저 남긴다. 응답이 실패해도 무엇을 보냈는지 기록에 남는다
    const content = image ? `[영수증 이미지] ${text}`.trim() : text;
    const last = history.at(-1);
    if (parsed.data.retry && last?.role === "user" && last.content === content) history.pop();
    else await q("insert into messages (user_id, role, content) values ($1,'user',$2)", [userId, content]);
    return { logId: log.id, history };
  });
  if (!started) return fail("오늘 사용할 수 있는 횟수를 모두 썼어요. 내일 다시 시도해 주세요.", 429);

  const t0 = Date.now();
  // 처음 끝난 결과 하나만 기록한다(onError 뒤에 onEnd가 와도 덮어쓰지 않음)
  const finish = (status: "ok" | "error" | "aborted", usage?: { inputTokens?: number; outputTokens?: number }) =>
    withUser(userId, (q) =>
      q(
        `update usage_logs set status = $2, input_tokens = $3, output_tokens = $4, latency_ms = $5
         where id = $1 and status = 'pending'`,
        [started.logId, status, usage?.inputTokens ?? null, usage?.outputTokens ?? null, Date.now() - t0],
      ),
    ).catch(() => {}); // 기록 실패가 응답을 막지 않게 한다

  const history: UIMessage[] = started.history.map((h) => ({ id: h.id, role: h.role, parts: [{ type: "text", text: h.content }] }));

  const result = streamText({
    model: picked.model,
    instructions: `너는 가계부 도우미 Ledgie다. 오늘은 ${todayKST()}(한국 시간)이다.
- 영수증이나 카드 문자를 받으면 항목(store, amount, category, spent_on)을 읽어 extract_receipt를 호출한다. raw_text에는 사용자가 보낸 원문을 그대로 넣는다. 이 도구가 검증과 저장을 함께 하며, 결과를 한두 문장으로 알려준다. 도구를 호출하지 않고 저장했다고 말하지 않는다.
- extract_receipt 결과가 duplicate이면 이미 저장된 영수증이라고 알린다. possible_duplicates이면 저장되지 않았으니 기존 항목을 보여주고 새 지출이 맞는지 묻는다. 사용자가 맞다고 하면 같은 항목으로 force: true를 넣어 다시 호출한다.
- 지출을 고치거나 지우려면 list_expenses로 id를 찾은 뒤 update_expense 또는 delete_expense를 쓴다. 지우기 전에는 어떤 항목인지 보여주고 사용자의 확인을 받는다.
- 분류는 ${CATEGORIES.join(", ")} 중 하나다. 날짜가 없으면 오늘 날짜를 쓴다. 금액은 원 단위 정수다.
- 카드번호·계좌번호는 다루지 않는다.
- 금액이나 합계를 묻는 질문은 monthly_summary 또는 list_expenses 결과만 근거로 답하고, 직접 계산하지 않는다.
- 답은 한국어 평어체로 짧게 쓴다.`,
    messages: await convertToModelMessages([...history, message]),
    tools: makeTools(userId),
    stopWhen: isStepCount(6),
    abortSignal: req.signal,
    onEnd: async ({ totalUsage, text, steps }) => {
      await finish("ok", totalUsage);
      const reply = text.trim() || summarizeToolResults(steps.flatMap((s) => s.toolResults));
      if (reply)
        await withUser(userId, (q) =>
          q("insert into messages (user_id, role, content) values ($1,'assistant',$2)", [userId, reply]),
        ).catch(() => {});
    },
    onAbort: () => void finish("aborted"),
    onError: () => void finish("error"),
  });

  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}
