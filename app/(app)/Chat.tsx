"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";

const MAX_IMAGE = 3 * 1024 * 1024; // 요청 본문 한도(4.5MB)를 넘지 않게

const toDataUrl = (f: File) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(r.error);
    r.readAsDataURL(f);
  });

// 서버가 { error } JSON으로 돌려준 문구를 그대로 보여준다
const errText = (e: Error) => {
  try {
    return JSON.parse(e.message).error as string;
  } catch {
    return "응답을 받지 못했어요.";
  }
};

export default function Chat({ initial }: { initial: UIMessage[] }) {
  const router = useRouter();
  const { messages, sendMessage, status, error, regenerate } = useChat({
    messages: initial,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [text, setText] = useState("");
  const [img, setImg] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const prev = useRef(status);
  const end = useRef<HTMLDivElement>(null);

  // 응답이 끝나면 장부를 다시 읽는다(저장된 행이 들어옴)
  useEffect(() => {
    if (prev.current !== "ready" && status === "ready") router.refresh();
    prev.current = status;
  }, [status, router]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages]);

  function pick(f?: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setNote("이미지 파일만 올릴 수 있어요.");
    if (f.size > MAX_IMAGE) return setNote("3MB 이하 이미지만 올릴 수 있어요.");
    setNote("");
    setImg(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((!text.trim() && !img) || status !== "ready") return;
    const files: FileUIPart[] = img
      ? [{ type: "file", mediaType: img.type, filename: img.name, url: await toDataUrl(img) }]
      : [];
    sendMessage({ text: text.trim() || "이 영수증을 장부에 적어줘", files });
    setText("");
    setImg(null);
  }

  const busy = status === "submitted" || status === "streaming";
  return (
    <section aria-label="질문하기" className="flex h-full min-h-[24rem] flex-col">
      <h2 className="text-lg font-bold">물어보기</h2>
      <div className="mt-3 flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
        {messages.map((m) => {
          const t = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          const hasImg = m.parts.some((p) => p.type === "file");
          if (!t && !hasImg) return null;
          return (
            <p key={m.id} className={m.role === "user" ? "text-ink-soft" : "font-medium"}>
              {hasImg && <span className="mr-1 text-blue">[영수증 이미지]</span>}
              {t}
            </p>
          );
        })}
        {busy && <p className="text-ink-soft">정리하는 중…</p>}
        {error && (
          <p role="alert" className="text-sm text-[#a3261c]">
            {errText(error)}{" "}
            <button onClick={() => regenerate()} className="underline underline-offset-2">
              다시 시도
            </button>
          </p>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="mt-3 border-t border-ink pt-3">
        {img && (
          <p className="mb-2 text-sm">
            {img.name}{" "}
            <button type="button" onClick={() => setImg(null)} className="text-ink-soft underline underline-offset-2">
              지우기
            </button>
          </p>
        )}
        {note && (
          <p role="alert" className="mb-2 text-sm text-[#a3261c]">
            {note}
          </p>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => pick([...e.clipboardData.files].find((f) => f.type.startsWith("image/")))}
          placeholder="카드 문자를 붙여넣거나 질문을 입력"
          aria-label="메시지"
          className="w-full rounded-[6px] border border-rule bg-white px-3 py-2 outline-none focus-visible:border-blue"
        />
        <div className="mt-2 flex items-center justify-between">
          <label className="cursor-pointer text-sm text-blue underline underline-offset-4">
            영수증 놓기
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <button disabled={busy} className="rounded-[6px] bg-blue px-4 py-1.5 font-semibold text-white disabled:opacity-60">
            저장
          </button>
        </div>
      </form>
    </section>
  );
}
