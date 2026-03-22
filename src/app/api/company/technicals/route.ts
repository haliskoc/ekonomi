import { NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooChart } from "@/lib/yahoo";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;

const schema = z.object({
  symbol: z.string().trim().min(1).max(24),
  range: z.enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd", "max"]).default("6mo"),
  interval: z.enum(["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo"]).default("1d"),
});

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `company-technicals:${clientIp}`,
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

  try {
    const parsed = schema.safeParse({
      symbol: request.nextUrl.searchParams.get("symbol") || "",
      range: request.nextUrl.searchParams.get("range") || "6mo",
      interval: request.nextUrl.searchParams.get("interval") || "1d",
    });

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "invalid query", 400, {
        requestId,
        code: "INVALID_QUERY",
      });
    }

    const points = await fetchYahooChart(parsed.data.symbol.toUpperCase(), parsed.data.range, parsed.data.interval);

    return jsonSuccess(
      {
        symbol: parsed.data.symbol.toUpperCase(),
        range: parsed.data.range,
        interval: parsed.data.interval,
        points,
      },
      { requestId }
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "unexpected error", 500, {
      requestId,
      code: "INTERNAL_ERROR",
    });
  }
}
