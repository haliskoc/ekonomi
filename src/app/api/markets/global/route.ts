import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooQuotes } from "@/lib/yahoo";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;

const GLOBAL_INDEXES = [
  { id: "dax", symbol: "^GDAXI", label: "DAX" },
  { id: "cac", symbol: "^FCHI", label: "CAC 40" },
  { id: "ftse", symbol: "^FTSE", label: "FTSE 100" },
  { id: "nikkei", symbol: "^N225", label: "Nikkei 225" },
  { id: "shanghai", symbol: "000001.SS", label: "Shanghai Composite" },
];

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `markets-global:${clientIp}`,
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
    const quotes = await fetchYahooQuotes(GLOBAL_INDEXES.map((item) => item.symbol));

    const markets = GLOBAL_INDEXES.map((item) => {
      const quote = quotes.find((row) => row.symbol === item.symbol);
      return {
        id: item.id,
        label: item.label,
        symbol: item.symbol,
        price: quote?.regularMarketPrice ?? null,
        changePercent: quote?.regularMarketChangePercent ?? null,
      };
    });

    return jsonSuccess({ generatedAt: new Date().toISOString(), markets }, { requestId });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "unexpected error", 500, {
      requestId,
      code: "INTERNAL_ERROR",
    });
  }
}
