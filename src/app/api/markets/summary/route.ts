import { NextRequest } from "next/server";
import { z } from "zod";
import { BIST100_COMPANIES } from "@/lib/bist100";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooQuotes } from "@/lib/yahoo";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;

const schema = z.object({
  market: z.enum(["bist100", "us"]).default("bist100"),
});

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `markets-summary:${clientIp}`,
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
      market: request.nextUrl.searchParams.get("market") || "bist100",
    });
    if (!parsed.success) {
      return jsonError("invalid query", 400, { requestId, code: "INVALID_QUERY" });
    }

    const symbols =
      parsed.data.market === "bist100"
        ? BIST100_COMPANIES.slice(0, 80).map((item) => `${item.symbol}.IS`)
        : ["^GSPC", "^NDX", "^DJI", "^RUT"];

    const quotes = await fetchYahooQuotes(symbols);
    const stocks = quotes
      .map((item) => ({
        symbol: item.symbol,
        price: item.regularMarketPrice ?? 0,
        changePercent: item.regularMarketChangePercent ?? 0,
        volume: item.regularMarketVolume ?? 0,
      }))
      .sort((a, b) => b.changePercent - a.changePercent);

    const gainers = stocks.slice(0, 8);
    const losers = [...stocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, 8);
    const byVolume = [...stocks].sort((a, b) => b.volume - a.volume).slice(0, 8);

    return jsonSuccess(
      {
        market: parsed.data.market,
        generatedAt: new Date().toISOString(),
        gainers,
        losers,
        byVolume,
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
