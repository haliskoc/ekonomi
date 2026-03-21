import { NextRequest } from "next/server";
import { z } from "zod";
import { createRequestId, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooQuotes } from "@/lib/yahoo";

const holdingSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  quantity: z.number().positive(),
  avgCost: z.number().nonnegative().optional(),
});

const bodySchema = z.object({
  holdings: z.array(holdingSchema).min(1).max(40),
});

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const raw = await request.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "invalid body", 400, {
        requestId,
        code: "INVALID_BODY",
      });
    }

    const holdings = parsed.data.holdings.map((item) => ({ ...item, symbol: item.symbol.toUpperCase() }));
    const quotes = await fetchYahooQuotes(holdings.map((item) => item.symbol));

    const rows = holdings.map((holding) => {
      const quote = quotes.find((item) => item.symbol?.toUpperCase() === holding.symbol);
      const price = quote?.regularMarketPrice ?? 0;
      const value = price * holding.quantity;
      const cost = (holding.avgCost ?? 0) * holding.quantity;
      const pnl = holding.avgCost !== undefined ? value - cost : null;
      return {
        ...holding,
        price,
        value,
        pnl,
      };
    });

    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
    const totalPnl = rows.reduce((sum, row) => sum + (row.pnl ?? 0), 0);

    return jsonSuccess(
      {
        rows,
        totals: {
          totalValue,
          totalPnl,
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
