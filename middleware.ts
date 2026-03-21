import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, isSessionTokenValid } from "@/lib/auth";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/api/health") return true;
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname.startsWith("/_next")) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const authenticated = isSessionTokenValid(token);

  if (authenticated && pathname === "/login") {
    const redirectUrl = new URL("/", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/login" || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (authenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
