import { NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooChart, fetchYahooQuotes } from "@/lib/yahoo";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;

const schema = z.object({
  symbols: z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
    )
    .refine((list) => list.length >= 2 && list.length <= 3, "2-3 symbol required"),
});

async function getOneMonthPerf(symbol: string): Promise<number | null> {
  const points = await fetchYahooChart(symbol, "1mo", "1d");
  if (points.length < 2) {
    return null;
  }

  const first = points[0].close;
  const last = points[points.length - 1].close;
  if (!first) {
    return null;
  }

  return ((last - first) / first) * 100;
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `company-compare:${clientIp}`,
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
      symbols: request.nextUrl.searchParams.get("symbols") || "",
    });
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "invalid query", 400, {
        requestId,
        code: "INVALID_QUERY",
      });
    }

    const symbols = parsed.data.symbols;
    const [quotes, perfs] = await Promise.all([
      fetchYahooQuotes(symbols),
      Promise.all(symbols.map((symbol) => getOneMonthPerf(symbol))),
    ]);

    const rows = symbols.map((symbol, index) => {
      const quote = quotes.find((item) => item.symbol?.toUpperCase() === symbol);
      return {
        symbol,
        name: quote?.longName || quote?.shortName || symbol,
        price: quote?.regularMarketPrice ?? null,
        exchange: quote?.exchange || null,
        oneMonthChangePercent: perfs[index],
        trailingPE: quote?.trailingPE ?? null,
        priceToBook: quote?.priceToBook ?? null,
      };
    });

    return jsonSuccess({ symbols, rows }, { requestId });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "unexpected error", 500, {
      requestId,
      code: "INTERNAL_ERROR",
    });
  }
}
