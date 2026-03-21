import { NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { fetchQuoteSummary, readFmt } from "@/lib/yahoo";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;

const schema = z.object({
  symbol: z.string().trim().min(1).max(24),
});

function toRows(list: unknown, keyName = "endDate", limit = 5): Array<Record<string, number | string | null>> {
  if (!Array.isArray(list)) {
    return [];
  }

  return list.slice(0, limit).map((entry) => {
    const row: Record<string, number | string | null> = {};
    if (!entry || typeof entry !== "object") {
      return row;
    }

    const obj = entry as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      row[key] = readFmt(value);
    }

    if (!row.date && row[keyName]) {
      row.date = row[keyName];
    }

    return row;
  });
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `company-financials:${clientIp}`,
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
    });
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "invalid query", 400, {
        requestId,
        code: "INVALID_QUERY",
      });
    }

    const symbol = parsed.data.symbol.toUpperCase();
    const summary = await fetchQuoteSummary(symbol, [
      "incomeStatementHistory",
      "balanceSheetHistory",
      "cashflowStatementHistory",
      "defaultKeyStatistics",
      "summaryDetail",
      "price",
    ]);

    const income = (summary.incomeStatementHistory as { incomeStatementHistory?: unknown[] } | undefined)?.incomeStatementHistory ?? [];
    const balance = (summary.balanceSheetHistory as { balanceSheetStatements?: unknown[] } | undefined)?.balanceSheetStatements ?? [];
    const cashflow = (summary.cashflowStatementHistory as { cashflowStatements?: unknown[] } | undefined)?.cashflowStatements ?? [];

    return jsonSuccess(
      {
        symbol,
        incomeStatement: toRows(income),
        balanceSheet: toRows(balance),
        cashflowStatement: toRows(cashflow),
        valuation: {
          trailingPE: readFmt((summary.summaryDetail as Record<string, unknown> | undefined)?.trailingPE),
          priceToBook: readFmt((summary.defaultKeyStatistics as Record<string, unknown> | undefined)?.priceToBook),
          marketCap: readFmt((summary.summaryDetail as Record<string, unknown> | undefined)?.marketCap),
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
