import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";

export const AUTH_COOKIE_NAME = "ekonomi_session";

function getAuthSecret(): string {
  return getOptionalEnv("AUTH_COOKIE_VALUE")?.trim() || "ekonomi-local-session";
}

export function validateCredentials(email: string, password: string): boolean {
  const expectedEmail = getOptionalEnv("ADMIN_EMAIL")?.trim() || "admin@ekonomi.local";
  const expectedPassword = getOptionalEnv("ADMIN_PASSWORD")?.trim() || "ChangeMe123!";

  return email.trim().toLowerCase() === expectedEmail.toLowerCase() && password === expectedPassword;
}

export function isSessionTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  return token === getAuthSecret();
}

export function setAuthCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE_NAME, getAuthSecret(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
