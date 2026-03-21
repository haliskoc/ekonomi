import { NextRequest, NextResponse } from "next/server";
import { createRequestId, getClientIp, jsonSuccess, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rateLimit";
import { getMarketDataStatus, fetchMarketQuote } from "@/lib/marketData";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);

  const rate = checkRateLimit({
    key: `market-status:${clientIp}`,
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
    const providers = getMarketDataStatus();
    
    // Test each provider with a simple quote
    const testSymbol = "AAPL";
    const testResults: Record<string, { available: boolean; error?: string }> = {};

    for (const provider of providers.filter(p => p.available)) {
      try {
        const quote = await fetchMarketQuote(testSymbol, provider.provider);
        testResults[provider.provider] = {
          available: !!quote,
          error: quote ? undefined : "No data returned",
        };
      } catch (error) {
        testResults[provider.provider] = {
          available: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    return jsonSuccess({
      providers: providers.map(p => ({
        ...p,
        testResult: testResults[p.provider],
      })),
      testSymbol,
      timestamp: new Date().toISOString(),
    }, { requestId });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "unexpected error",
      500,
      {
        requestId,
        code: "INTERNAL_ERROR",
      }
    );
  }
}