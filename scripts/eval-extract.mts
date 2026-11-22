// 영수증 텍스트 20건을 실제 /api/chat에 보내 추출 성공률을 잰다 (서버가 떠 있어야 함)
// 성공 = 저장된 (금액, 분류) 목록이 정답과 정확히 같음
const base = process.env.BASE ?? "http://localhost:3000";
const email = "eval@ledgie.test", password = "eval-pass-1234";
const post = (path: string, body: unknown, cookie = "") =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", origin: base, cookie }, body: JSON.stringify(body) });

let r = await post("/api/auth/sign-in/email", { email, password });
if (!r.ok) r = await post("/api/auth/sign-up/email", { email, password, name: "eval" });
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const d = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

type Exp = [number, string][];
const cases: [string, Exp][] = [
  [`[KB카드] 승인 스타벅스 강남점 6,500원 ${d}`, [[6500, "식비"]]],
  [`[신한카드] 승인 GS25 역삼점 3,200원 ${d}`, [[3200, "식비"]]],
  [`[삼성카드] 승인 서울교통공사 1,550원 ${d}`, [[1550, "교통"]]],
  [`[현대카드] 승인 쿠팡 29,900원 일시불 ${d}`, [[29900, "쇼핑"]]],
  [`[농협카드] 승인 온누리약국 8,000원 ${d}`, [[8000, "의료"]]],
  [`[KB카드] 승인 CGV 용산 14,000원 ${d}`, [[14000, "문화"]]],
  [`[우리카드] 승인 배달의민족 22,500원 ${d}`, [[22500, "식비"]]],
  [`[하나카드] 승인 카카오T택시 9,800원 ${d}`, [[9800, "교통"]]],
  [`[신한카드] 승인 이마트 성수점 54,320원 ${d}`, [[54320, "쇼핑"]]],
  [`[KB카드] 승인 맘스터치 5,900원 ${d}`, [[5900, "식비"]]],
  [`영수증\n상호: 김밥천국\n김밥 3,500\n라면 4,500\n합계 8,000원\n${d}`, [[8000, "식비"]]],
  [`영수증\n서울대병원 외래 진료비 15,600원 ${d}`, [[15600, "의료"]]],
  [`[삼성카드] 승인 올리브영 홍대점 31,200원 ${d}`, [[31200, "쇼핑"]]],
  [`[롯데카드] 승인 코레일 KTX 서울-부산 59,800원 ${d}`, [[59800, "교통"]]],
  [`[KB카드] 승인 교보문고 광화문 18,000원 ${d}`, [[18000, "문화"]]],
  [`[신한카드] 승인 이디야커피 4,300원 ${d}\n[신한카드] 승인 CU 편의점 2,100원 ${d}`, [[4300, "식비"], [2100, "식비"]]],
  [`[농협카드] 승인 SK주유소 55,000원 ${d}`, [[55000, "교통"]]],
  [`[우리카드] 승인 한국전력 관리비 87,400원 ${d}`, [[87400, "주거"]]],
  [`[현대카드] 승인 봉구스밥버거 6,200원 ${d}`, [[6200, "식비"]]],
  [`[하나카드] 승인 메가박스 코엑스 13,000원 ${d}`, [[13000, "문화"]]],
];

const key = (e: Exp) => e.map(([a, c]) => `${a}:${c}`).sort().join(",");
let ok = 0, saved = 0;
for (const [i, [text, want]] of cases.entries()) {
  const t0 = Date.now();
  const res = await post("/api/chat", { messages: [{ id: `e${i}-${t0}`, role: "user", parts: [{ type: "text", text }] }] }, cookie);
  const raw = await res.text();
  const outs = raw.split("\n").filter((l) => l.startsWith("data: {")).map((l) => JSON.parse(l.slice(6)));
  const call = outs.find((e) => e.type === "tool-input-available" && e.toolName === "extract_receipt");
  const got: Exp = (call?.input?.items ?? []).map((x: { amount: number; category: string }) => [x.amount, x.category]);
  const wrote = outs.some((e) => e.type === "tool-output-available" && e.output?.saved > 0);
  const hit = key(got) === key(want);
  if (hit) ok++;
  if (wrote) saved++;
  console.log(`${hit ? "OK  " : "MISS"} ${wrote ? "saved" : "NOT-SAVED"} ${Date.now() - t0}ms  기대 ${key(want)} / 결과 ${key(got) || "-"}`);
}
console.log(`\n추출 정확도 ${ok}/${cases.length}, 저장 성공 ${saved}/${cases.length}`);
