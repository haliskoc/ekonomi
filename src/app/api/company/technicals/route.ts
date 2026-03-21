import { NextRequest } from "next/server";
import { z } from "zod";
import { createRequestId, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooChart } from "@/lib/yahoo";

const schema = z.object({
  symbol: z.string().trim().min(1).max(24),
  range: z.enum(["1mo", "3mo", "6mo", "1y"]).default("6mo"),
  interval: z.enum(["1d", "1wk"]).default("1d"),
});

export async function GET(request: NextRequest) {
  const requestId = createRequestId();

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
