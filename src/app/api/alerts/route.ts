import { NextRequest } from "next/server";
import { z } from "zod";
import { createRequestId, jsonError, jsonSuccess } from "@/lib/api";
import { fetchYahooQuotes } from "@/lib/yahoo";
import {
  getAlertLimit,
  getCurrentSessionKey,
  listAlerts,
  markTriggered,
  removeAlert,
  upsertAlert,
} from "@/lib/alerts";

const createSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  direction: z.enum(["above", "below"]),
  targetPrice: z.number().positive(),
});

const deleteSchema = z.object({
  id: z.string().trim().min(1),
});

export async function GET() {
  const requestId = createRequestId();

  try {
    const sessionKey = await getCurrentSessionKey();
    const alerts = listAlerts(sessionKey);

    const uniqueSymbols = Array.from(new Set(alerts.map((item) => item.symbol)));
    const quotes = await fetchYahooQuotes(uniqueSymbols);

    const evaluated = alerts.map((alert) => {
      const price = quotes.find((item) => item.symbol?.toUpperCase() === alert.symbol.toUpperCase())?.regularMarketPrice ?? null;
      const triggered =
        alert.triggeredAt || price === null
          ? Boolean(alert.triggeredAt)
          : alert.direction === "above"
            ? price >= alert.targetPrice
            : price <= alert.targetPrice;

      if (triggered && !alert.triggeredAt) {
        markTriggered(sessionKey, alert.id);
      }

      return {
        ...alert,
        currentPrice: price,
        triggered,
      };
    });

    return jsonSuccess(
      {
        limit: getAlertLimit(),
        count: evaluated.length,
        alerts: evaluated,
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

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const raw = await request.json();
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "invalid body", 400, {
        requestId,
        code: "INVALID_BODY",
      });
    }

    const sessionKey = await getCurrentSessionKey();
    const alert = upsertAlert(sessionKey, {
      symbol: parsed.data.symbol.toUpperCase(),
      direction: parsed.data.direction,
      targetPrice: parsed.data.targetPrice,
    });

    return jsonSuccess({ alert, limit: getAlertLimit() }, { requestId, status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "unexpected error", 400, {
      requestId,
      code: "ALERT_CREATE_FAILED",
    });
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const raw = await request.json();
    const parsed = deleteSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "invalid body", 400, {
        requestId,
        code: "INVALID_BODY",
      });
    }

    const sessionKey = await getCurrentSessionKey();
    const ok = removeAlert(sessionKey, parsed.data.id);
    return jsonSuccess({ ok }, { requestId });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "unexpected error", 500, {
      requestId,
      code: "INTERNAL_ERROR",
    });
  }
}
