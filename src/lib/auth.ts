import { NextResponse } from "next/server";
import { getRequiredEnv } from "@/lib/env";

export const AUTH_COOKIE_NAME = "ekonomi_session";

function getAuthSecret(): string {
  return getRequiredEnv("AUTH_COOKIE_VALUE").trim();
}

export function validateCredentials(email: string, password: string): boolean {
  const expectedEmail = getRequiredEnv("ADMIN_EMAIL").trim();
  const expectedPassword = getRequiredEnv("ADMIN_PASSWORD").trim();

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
