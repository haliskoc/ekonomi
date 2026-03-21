import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { getDatabaseUrl, pingDatabase } from "@/lib/db";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `health:${clientIp}`,
    limit: RATE_LIMIT_COUNT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rate.allowed) {
    return jsonError("too many requests", 429, {
      requestId,
      code: "RATE_LIMITED",
      headers: {
        "retry-after": String(rate.retryAfterSeconds),
      },
    });
  }

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
