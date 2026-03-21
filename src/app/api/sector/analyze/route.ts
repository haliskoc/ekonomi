import { NextRequest } from "next/server";
import { z } from "zod";
import { createRequestId, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooQuotes } from "@/lib/yahoo";

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
        .slice(0, 20)
    ),
  sector: z.string().trim().max(64).optional(),
});

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const parsed = schema.safeParse({
      symbols: request.nextUrl.searchParams.get("symbols") || "",
      sector: request.nextUrl.searchParams.get("sector") || undefined,
    });
    if (!parsed.success) {
      return jsonError("invalid query", 400, { requestId, code: "INVALID_QUERY" });
    }

    const quotes = await fetchYahooQuotes(parsed.data.symbols);
    const changes = quotes
      .map((item) => item.regularMarketChangePercent)
      .filter((item): item is number => typeof item === "number");

    const avgChange = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
    const positive = changes.filter((item) => item > 0).length;

    return jsonSuccess(
      {
        sector: parsed.data.sector || "mixed",
        symbols: parsed.data.symbols,
        companyCount: quotes.length,
        averageDayChangePercent: avgChange,
        breadth: {
          advancing: positive,
          declining: Math.max(0, changes.length - positive),
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
