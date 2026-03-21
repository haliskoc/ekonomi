import { NextRequest } from "next/server";
import { buildAnalysis } from "@/lib/market";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";

type CacheEntry = {
  expiresAt: number;
  payload: Record<string, unknown>;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 20;

const bodySchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "symbol is required")
    .max(16, "symbol is too long")
    .regex(/^[A-Za-z0-9.\-]+$/, "symbol contains invalid characters"),
  company: z.string().trim().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `company-analyze:${clientIp}`,
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
    const rawBody = await request.json();
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "invalid request body", 400, {
        requestId,
        code: "INVALID_BODY",
      });
    }
    const symbol = parsed.data.symbol.trim().toUpperCase();
    const company = (parsed.data.company || symbol).trim();

    const cacheKey = `${symbol}:${company}`;
    const now = Date.now();
    const cached = cache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return jsonSuccess(
        { ...cached.payload, cached: true, requestId },
        {
          requestId,
          headers: {
            "cache-control": "private, max-age=60",
            "x-ratelimit-remaining": String(rate.remaining),
          },
        }
      );
    }

    const result = await buildAnalysis(company, symbol);

    const payload: Record<string, unknown> = {
      symbol,
      company,
      fetchedAt: new Date().toISOString(),
      ...result,
      cached: false,
    };

    cache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      payload,
    });

    return jsonSuccess({ ...payload, requestId }, {
      requestId,
      headers: {
        "cache-control": "no-store",
        "x-ratelimit-remaining": String(rate.remaining),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonError(message, 500, {
      requestId,
      code: "INTERNAL_ERROR",
      headers: {
        "x-ratelimit-remaining": String(rate.remaining),
      },
    });
  }
}
