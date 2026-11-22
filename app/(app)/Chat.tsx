"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { MAX_IMAGE_BYTES } from "@/lib/limits";

const MAX_SOURCE = 20 * 1024 * 1024; // 줄이기 전 원본 한도
const MAX_SIDE = 1600; // 영수증 글자를 읽기에 충분한 긴 변 길이

const toDataUrl = (b: Blob) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(r.error);
    r.readAsDataURL(b);
  });

// 업로드 전에 긴 변을 줄이고 JPEG로 압축한다. 대부분 1MB 아래가 된다
async function shrink(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
  if (!out) throw new Error("이미지를 변환하지 못했어요.");
  return out;
}

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
  // 이전 대화는 서버가 DB에서 읽으므로 새 메시지 하나만 보낸다(이미지가 다시 실리지 않게)
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, trigger }) => ({
          body: { message: messages.findLast((m) => m.role === "user"), retry: trigger === "regenerate-message" },
        }),
      }),
    [],
  );
  const { messages, sendMessage, status, error, regenerate } = useChat({ messages: initial, transport });
  const [text, setText] = useState("");
  const [img, setImg] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const prev = useRef(status);
  const end = useRef<HTMLDivElement>(null);

  // 응답이 끝나면 장부를 다시 읽는다(저장된 행이 들어옴)
  useEffect(() => {
    if (prev.current !== "ready" && status === "ready") router.refresh();
    prev.current = status;
  }, [status, router]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function pick(f?: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setNote("이미지 파일만 올릴 수 있어요.");
    if (f.size > MAX_SOURCE) return setNote("20MB 이하 이미지만 올릴 수 있어요.");
    setNote("");
    setImg(f);
  }

  const busy = sending || status === "submitted" || status === "streaming";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || (!text.trim() && !img)) return;
    setSending(true); // 이미지 변환 중 두 번 보내지 않게 바로 막는다
    try {
      let files: FileUIPart[] = [];
      if (img) {
        const blob = await shrink(img);
        if (blob.size > MAX_IMAGE_BYTES) return setNote("이미지를 3MB 이하로 줄이지 못했어요. 더 작은 사진을 올려 주세요.");
        files = [{ type: "file", mediaType: "image/jpeg", filename: img.name, url: await toDataUrl(blob) }];
      }
      await sendMessage({ text: text.trim() || "이 영수증을 장부에 적어줘", files });
      setText("");
      setImg(null);
    } catch {
      setNote("이미지를 읽지 못했어요. 다른 사진으로 시도해 주세요.");
    } finally {
      setSending(false);
    }
  }

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
          <p role="alert" className="text-sm text-danger">
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
          <p role="alert" className="mb-2 text-sm text-danger">
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
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = ""; // 같은 파일을 다시 골라도 onChange가 오게
              }}
            />
          </label>
          <button disabled={busy} className="rounded-[6px] bg-blue px-4 py-1.5 font-semibold text-white disabled:opacity-60">
            보내기
          </button>
        </div>
      </form>
    </section>
  );
}
