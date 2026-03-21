import { neon } from "@neondatabase/serverless";

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL?.trim();
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
