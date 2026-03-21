import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooQuotes } from "@/lib/yahoo";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;

async function fetchWorldBankInflation(): Promise<number | null> {
  try {
    const response = await fetch("https://api.worldbank.org/v2/country/TR/indicator/FP.CPI.TOTL.ZG?format=json&per_page=5", {
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as unknown;
    if (!Array.isArray(json) || !Array.isArray(json[1])) {
      return null;
    }

    const row = (json[1] as Array<{ value: number | null }>).find((item) => typeof item.value === "number");
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `macro-indicators:${clientIp}`,
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
    const quotes = await fetchYahooQuotes(["TRY=X", "EURTRY=X", "^TNX"]);
    const usdtry = quotes.find((item) => item.symbol === "TRY=X")?.regularMarketPrice ?? null;
    const eurtry = quotes.find((item) => item.symbol === "EURTRY=X")?.regularMarketPrice ?? null;
    const us10y = quotes.find((item) => item.symbol === "^TNX")?.regularMarketPrice ?? null;
    const trInflation = await fetchWorldBankInflation();

    return jsonSuccess(
      {
        generatedAt: new Date().toISOString(),
        indicators: {
          usdtry,
          eurtry,
          us10yYield: us10y,
          turkeyInflationYoY: trInflation,
        },
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
