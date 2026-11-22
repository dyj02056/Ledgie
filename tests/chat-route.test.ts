import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Client } from "pg";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { withUser } from "../lib/db";
import { dropUsers, makeUser, ownerClient } from "./helpers";

// 로그인과 모델 호출만 바꿔 끼우고 나머지(검증, 상한, DB 기록)는 실제 코드로 돈다
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth", () => ({ getUserId: async () => session.userId || null }));
vi.mock("@/lib/agent/model", () => ({
  NoVisionError: class extends Error {},
  pickModel: () => ({
    id: "mock",
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunkDelayInMs: 5,
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "알겠어요." },
            { type: "text-end", id: "t" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 3, text: 3, reasoning: 0 },
              },
            },
          ],
        }),
      }),
    }),
  }),
}));

const { POST } = await import("../app/api/chat/route");

let owner: Client;
beforeAll(async () => {
  owner = await ownerClient();
});
afterAll(() => owner.end());

const msg = (parts: unknown[]) => ({ message: { id: `m-${Math.random()}`, role: "user", parts } });
const call = (body: unknown) =>
  POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const text = (t: string) => msg([{ type: "text", text: t }]);

async function asUser<T>(fn: (id: string) => Promise<T>) {
  const id = await makeUser(owner, "route");
  session.userId = id;
  try {
    return await fn(id);
  } finally {
    session.userId = "";
    await dropUsers(owner, [id]);
  }
}

describe("요청 검증", () => {
  it("로그인하지 않으면 401", async () => expect((await call(text("안녕"))).status).toBe(401));

  it.each([
    ["메시지 배열(이전 형식)", { messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "x" }] }] }],
    ["assistant 역할", { message: { id: "1", role: "assistant", parts: [{ type: "text", text: "x" }] } }],
    ["이미지 2장", msg([1, 2].map(() => ({ type: "file", mediaType: "image/png", url: "data:image/png;base64,AA" })))],
    ["이미지가 아닌 파일", msg([{ type: "file", mediaType: "application/pdf", url: "data:application/pdf;base64,AA" }])],
  ])("%s는 400", (_n, body) => asUser(async () => expect((await call(body)).status).toBe(400)));

  it("3MB를 넘는 이미지는 413", () =>
    asUser(async () => {
      const big = "data:image/jpeg;base64," + "A".repeat(Math.ceil((3 * 1024 * 1024 * 4) / 3) + 8);
      expect((await call(msg([{ type: "file", mediaType: "image/jpeg", url: big }]))).status).toBe(413);
    }));
});

describe("일일 상한과 기록", () => {
  it("동시에 보내도 상한을 넘지 않고, 끝난 호출은 ok로 기록된다", () =>
    asUser(async (id) => {
      vi.stubEnv("DAILY_CALL_LIMIT", "3");
      try {
        const res = await Promise.all(Array.from({ length: 6 }, (_, i) => call(text(`질문 ${i}`))));
        expect(res.filter((r) => r.status === 200)).toHaveLength(3);
        expect(res.filter((r) => r.status === 429)).toHaveLength(3);
        await Promise.all(res.map((r) => r.text()));
        await vi.waitFor(async () => {
          const rows = await withUser(id, (q) => q<{ status: string }>("select status from usage_logs"));
          expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
        });
      } finally {
        vi.unstubAllEnvs();
      }
    }));

  it("실패 뒤 다시 시도하면 사용자 메시지를 두 번 남기지 않는다", () =>
    asUser(async (id) => {
      // 앞선 시도가 응답 없이 실패해 사용자 메시지만 남은 상태
      await withUser(id, (q) => q("insert into messages (user_id, role, content) values ($1,'user','첫 질문')", [id]));
      await (await call({ ...text("첫 질문"), retry: true })).text();
      await vi.waitFor(async () => {
        const rows = await withUser(id, (q) => q<{ role: string; content: string }>("select role, content from messages order by created_at"));
        expect(rows).toEqual([
          { role: "user", content: "첫 질문" },
          { role: "assistant", content: "알겠어요." },
        ]);
      });
    }));
});
