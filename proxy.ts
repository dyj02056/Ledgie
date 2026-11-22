import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// 세션 쿠키가 아예 없으면 페이지를 그리기 전에 로그인으로 보낸다(빠른 1차 확인)
// 쿠키의 유효성은 확인하지 않으므로 각 페이지의 requireUserId()와 RLS가 실제 방어선이다
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|login|reset-password|_next/static|_next/image|favicon.ico|fonts).*)"],
};
