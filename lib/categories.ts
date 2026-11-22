// 클라이언트 컴포넌트도 쓰므로 DB 모듈과 분리해 둔다
export const CATEGORIES = ["식비", "교통", "주거", "쇼핑", "의료", "문화", "기타"] as const;
export type Category = (typeof CATEGORIES)[number];
