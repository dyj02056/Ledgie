import type { UIMessage } from "ai";

export type Kind = "receipt_text" | "receipt_image" | "question";

// shortcut: 규칙 기반 분류, 오분류율이 10%를 넘으면 소형 모델로 교체
export function classify(m: UIMessage): Kind {
  if (m.parts.some((p) => p.type === "file" && p.mediaType.startsWith("image/"))) return "receipt_image";
  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
  const looksLikeReceipt = /\d{1,3}(,\d{3})+|\d+\s*원|승인|결제|합계|total/i.test(text) && text.length >= 8;
  return looksLikeReceipt && !/[?？]\s*$/.test(text) ? "receipt_text" : "question";
}
