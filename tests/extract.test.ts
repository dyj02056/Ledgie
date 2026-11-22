import { describe, expect, it } from "vitest";
import { classify } from "../lib/agent/classify";
import { item } from "../lib/agent/tools";

const msg = (text: string, image = false) => ({
  id: "1",
  role: "user" as const,
  parts: [{ type: "text" as const, text }, ...(image ? [{ type: "file" as const, mediaType: "image/png", url: "data:," }] : [])],
});

describe("추출 스키마", () => {
  const ok = { store: "스타벅스", amount: 6500, category: "식비", spent_on: "2026-11-22" };
  it("올바른 항목은 통과", () => expect(item.safeParse(ok).success).toBe(true));
  it.each([
    ["금액 0", { ...ok, amount: 0 }],
    ["소수 금액", { ...ok, amount: 12.5 }],
    ["없는 분류", { ...ok, category: "게임" }],
    ["없는 날짜", { ...ok, spent_on: "2026-13-40" }],
    ["빈 가게명", { ...ok, store: "" }],
  ])("%s는 거부", (_n, v) => expect(item.safeParse(v).success).toBe(false));
});

describe("입력 분류", () => {
  it("카드 문자는 receipt_text", () => expect(classify(msg("[KB카드] 승인 스타벅스 6,500원"))).toBe("receipt_text"));
  it("질문은 question", () => expect(classify(msg("이번 달 식비 12,000원 넘었어?"))).toBe("question"));
  it("이미지가 있으면 receipt_image", () => expect(classify(msg("영수증", true))).toBe("receipt_image"));
});
