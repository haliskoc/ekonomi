import { createRequestId, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooQuotes } from "@/lib/yahoo";

const GLOBAL_INDEXES = [
  { id: "dax", symbol: "^GDAXI", label: "DAX" },
  { id: "cac", symbol: "^FCHI", label: "CAC 40" },
  { id: "ftse", symbol: "^FTSE", label: "FTSE 100" },
  { id: "nikkei", symbol: "^N225", label: "Nikkei 225" },
  { id: "shanghai", symbol: "000001.SS", label: "Shanghai Composite" },
];

export async function GET() {
  const requestId = createRequestId();
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
