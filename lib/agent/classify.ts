import type { UIMessage } from "ai";

// 모델 선택에 쓰이는 건 이미지가 있는지뿐이다
export const hasImage = (m: Pick<UIMessage, "parts">) =>
  m.parts.some((p) => p.type === "file" && p.mediaType.startsWith("image/"));
