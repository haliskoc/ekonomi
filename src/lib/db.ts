import { neon } from "@neondatabase/serverless";
import { getOptionalEnv } from "@/lib/env";

export function getDatabaseUrl(): string | null {
  const url = getOptionalEnv("DATABASE_URL")?.trim();
  return url ? url : null;
}

export async function pingDatabase(): Promise<boolean> {
  const url = getDatabaseUrl();
  if (!url) {
    return false;
  }

  const sql = neon(url);
  const result = await sql`SELECT 1 as ok`;
  return Array.isArray(result) && result[0]?.ok === 1;
}

export function getDbClient() {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}
