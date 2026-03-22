import { NextResponse } from "next/server";
import { getRequiredEnv } from "@/lib/env";
import { getDbClient } from "@/lib/db";
import bcrypt from "bcryptjs";

export const AUTH_COOKIE_NAME = "ekonomi_session";

// SECURITY: Admin password must be bcrypt hashed in production
// Generate hash with: node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
// Then set ADMIN_PASSWORD_HASH in .env instead of ADMIN_PASSWORD

function getAuthSecret(): string {
  const secret = getRequiredEnv("AUTH_COOKIE_VALUE").trim();
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_COOKIE_VALUE must be at least 16 characters for security.");
  }
  return secret;
}

export async function validateCredentials(email: string, password: string): Promise<boolean> {
  const emailInput = email.trim().toLowerCase();
  try {
    const sql = getDbClient();
    const users = await sql`SELECT * FROM users WHERE email = ${emailInput}`;
    if (!users || users.length === 0) {
      // Mitigate User Enumeration Timing Attack by performing dummy hash check
      await bcrypt.compare(password, "$2a$10$abcdefghijklmnopqrstuvwxyz1234567890123");
      return validateAdminCredentials(emailInput, password);
    }
    
    const user = users[0];
    return await bcrypt.compare(password, user.password_hash);
  } catch (err: unknown) {
    const error = err as Error;
    if (!error.message?.includes("relation \"users\" does not exist")) {
        console.error("DB auth failed:", err);
    }
    return validateAdminCredentials(emailInput, password);
  }
}

async function validateAdminCredentials(emailInput: string, password: string): Promise<boolean> {
  const { getOptionalEnv } = await import("@/lib/env");
  const expectedEmail = getOptionalEnv("ADMIN_EMAIL")?.trim().toLowerCase();
  
  if (!expectedEmail || emailInput !== expectedEmail) {
    return false;
  }

  // Prefer hashed password if available
  const hashedPassword = getOptionalEnv("ADMIN_PASSWORD_HASH")?.trim();
  if (hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Fallback to plaintext (not recommended for production)
  const expectedPassword = getOptionalEnv("ADMIN_PASSWORD")?.trim();
  if (!expectedPassword) {
    console.warn("Neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD is set");
    return false;
  }
  return password === expectedPassword;
}

export function isSessionTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const secret = getAuthSecret();
  if (token.length !== secret.length) return false;
  // Constant time string comparison to prevent timing attacks
  let mismatch = 0;
  for (let i = 0; i < token.length; ++i) {
    mismatch |= (token.charCodeAt(i) ^ secret.charCodeAt(i));
  }
  return mismatch === 0;
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
