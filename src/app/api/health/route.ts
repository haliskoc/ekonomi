import { createRequestId, jsonSuccess } from "@/lib/api";
import { getDatabaseUrl, pingDatabase } from "@/lib/db";

export async function GET() {
  const requestId = createRequestId();
  const dbConfigured = Boolean(getDatabaseUrl());
  let dbReachable = false;

  if (dbConfigured) {
    try {
      dbReachable = await pingDatabase();
    } catch {
      dbReachable = false;
    }
  }

  return jsonSuccess(
    {
      status: "ok",
      service: "ekonomi",
      now: new Date().toISOString(),
      checks: {
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
        dbConfigured,
        dbReachable,
      },
      requestId,
    },
    {
      requestId,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}
