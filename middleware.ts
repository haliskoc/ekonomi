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

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  
  // Improved CSP without unsafe-inline and unsafe-eval where possible
  // Note: Next.js requires some inline scripts, so we use a more permissive policy
  // For maximum security, consider using nonces (requires custom server setup)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required for Next.js
    "style-src 'self' 'unsafe-inline'", // Required for Tailwind
    "img-src 'self' data: https: http:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss: ws:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const authenticated = isSessionTokenValid(token);

  if (authenticated && pathname === "/login") {
    const redirectUrl = new URL("/", request.url);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  if (pathname === "/login" || isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (authenticated) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (pathname.startsWith("/api")) {
    return applySecurityHeaders(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return applySecurityHeaders(NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
