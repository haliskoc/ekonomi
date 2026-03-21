import { NextResponse } from "next/server";
import { getRequiredEnv } from "@/lib/env";
import { getDbClient } from "@/lib/db";
import bcrypt from "bcryptjs";

export const AUTH_COOKIE_NAME = "ekonomi_session";

function getAuthSecret(): string {
  try {
    return getRequiredEnv("AUTH_COOKIE_VALUE").trim();
  } catch {
    return "default_secret_for_local_dev";
  }
}

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const emailInput = email.trim().toLowerCase();
  try {
    const sql = getDbClient();
    const users = await sql`SELECT * FROM users WHERE email = ${emailInput}`;
    if (!users || users.length === 0) {
      const expectedEmail = getRequiredEnv("ADMIN_EMAIL").trim();
      const expectedPassword = getRequiredEnv("ADMIN_PASSWORD").trim();
      return emailInput === expectedEmail.toLowerCase() && password === expectedPassword;
    }
    
    const user = users[0];
    return await bcrypt.compare(password, user.password_hash);
  } catch (err: unknown) {
    const error = err as Error;
    if (!error.message?.includes("relation \"users\" does not exist")) {
        console.error("DB auth failed:", err);
    }
    const expectedEmail = getRequiredEnv("ADMIN_EMAIL").trim();
    const expectedPassword = getRequiredEnv("ADMIN_PASSWORD").trim();
    return emailInput === expectedEmail.toLowerCase() && password === expectedPassword;
  }
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
