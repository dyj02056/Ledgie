// 금액은 정수 원으로만 다룬다
export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

// 서버 시간대와 상관없이 한국 날짜 기준으로 오늘/이번 달을 구한다
export const todayKST = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
export const monthKST = () => todayKST().slice(0, 7);
