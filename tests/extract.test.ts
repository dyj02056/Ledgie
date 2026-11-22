import { describe, expect, it } from "vitest";
import { hasImage } from "../lib/agent/classify";
import { summarizeToolResults } from "../lib/agent/tools";
import { item, patch, sourceHash } from "../lib/expenses";

describe("추출 스키마", () => {
  const ok = { store: "스타벅스", amount: 6500, category: "식비", spent_on: "2026-11-22" };
  it("올바른 항목은 통과", () => expect(item.safeParse(ok).success).toBe(true));
  it.each([
    ["금액 0", { ...ok, amount: 0 }],
    ["소수 금액", { ...ok, amount: 12.5 }],
    ["없는 분류", { ...ok, category: "게임" }],
    ["없는 날짜", { ...ok, spent_on: "2026-13-40" }],
    ["빈 가게명", { ...ok, store: "  " }],
  ])("%s는 거부", (_n, v) => expect(item.safeParse(v).success).toBe(false));
  it("수정 값은 하나 이상", () => {
    expect(patch.safeParse({}).success).toBe(false);
    expect(patch.safeParse({ amount: 100 }).success).toBe(true);
  });
});

describe("원문 해시", () => {
  it("공백·줄바꿈 차이는 같은 원문", () =>
    expect(sourceHash("[KB카드] 승인\n스타벅스  6,500원 ")).toBe(sourceHash("[KB카드] 승인 스타벅스 6,500원")));
  it("내용이 다르면 다른 해시", () => expect(sourceHash("6,500원")).not.toBe(sourceHash("6,600원")));
});

describe("이미지 판별", () => {
  const msg = (image: boolean) => ({
    parts: [{ type: "text" as const, text: "영수증" }, ...(image ? [{ type: "file" as const, mediaType: "image/png", url: "data:," }] : [])],
  });
  it("이미지가 있으면 true", () => expect(hasImage(msg(true))).toBe(true));
  it("글만 있으면 false", () => expect(hasImage(msg(false))).toBe(false));
});

describe("도구 결과 요약", () => {
  it("저장·중복·수정을 한 줄로", () =>
    expect(
      summarizeToolResults([
        { toolName: "extract_receipt", output: { status: "saved", saved: 2 } },
        { toolName: "extract_receipt", output: { status: "duplicate" } },
        { toolName: "delete_expense", output: { ok: true } },
      ]),
    ).toBe("2건 저장했어요. 이미 저장한 영수증이에요. 지출을 지웠어요."));
});
