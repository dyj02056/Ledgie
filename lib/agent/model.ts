import { anthropic } from "@ai-sdk/anthropic";
import { ollama } from "ollama-ai-provider-v2";
import type { Kind } from "./classify";

export class NoVisionError extends Error {}

// 환경변수 한 줄(LLM_PROVIDER)로 Ollama(개발)와 Claude(운영)를 바꾼다
export function pickModel(kind: Kind) {
  const image = kind === "receipt_image";
  if (process.env.LLM_PROVIDER === "anthropic") {
    const id = (image ? process.env.ANTHROPIC_VISION_MODEL : process.env.ANTHROPIC_MODEL) ?? "claude-haiku-5-5";
    return { model: anthropic(id), id };
  }
  const id = image ? process.env.OLLAMA_VISION_MODEL : process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
  if (!id) throw new NoVisionError("이미지를 읽는 모델이 설정되지 않았어요. 영수증 내용을 글로 붙여넣어 주세요.");
  return { model: ollama(id), id };
}
