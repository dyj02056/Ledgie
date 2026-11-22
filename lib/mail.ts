// 메일 발송: RESEND_API_KEY와 MAIL_FROM이 있으면 Resend로 보내고, 없으면 개발 환경에서만 콘솔에 출력한다
export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export async function sendMail({ to, subject, text }: { to: string; subject: string; text: string }) {
  if (!mailConfigured()) {
    // 운영에서 링크(토큰)가 로그에 남지 않게 한다
    if (process.env.NODE_ENV === "production") console.warn(`[mail] 발송 설정이 없어 "${subject}" 메일을 보내지 못했어요.`);
    else console.info(`[mail] to=${to}\n${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`메일 발송 실패: ${res.status}`);
}
