import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";

export type PriceAlert = {
  id: string;
  symbol: string;
  direction: "above" | "below";
  targetPrice: number;
  createdAt: string;
  triggeredAt?: string;
};

const MAX_ALERTS_PER_USER = 10;
const alertsBySession = new Map<string, PriceAlert[]>();

function getSessionKey(token?: string): string {
  return token?.trim() || "guest";
}

export async function getCurrentSessionKey(): Promise<string> {
  const store = await cookies();
  return getSessionKey(store.get(AUTH_COOKIE_NAME)?.value);
}

export function listAlerts(sessionKey: string): PriceAlert[] {
  return alertsBySession.get(sessionKey) ?? [];
}

export function upsertAlert(sessionKey: string, alert: Omit<PriceAlert, "id" | "createdAt">): PriceAlert {
  const current = alertsBySession.get(sessionKey) ?? [];
  if (current.length >= MAX_ALERTS_PER_USER) {
    throw new Error(`alert limit exceeded (${MAX_ALERTS_PER_USER})`);
  }

  const created: PriceAlert = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...alert,
  };

  alertsBySession.set(sessionKey, [created, ...current]);
  return created;
}

export function removeAlert(sessionKey: string, alertId: string): boolean {
  const current = alertsBySession.get(sessionKey) ?? [];
  const next = current.filter((item) => item.id !== alertId);
  alertsBySession.set(sessionKey, next);
  return next.length !== current.length;
}

export function markTriggered(sessionKey: string, alertId: string): void {
  const current = alertsBySession.get(sessionKey) ?? [];
  const updated = current.map((item) => {
    if (item.id !== alertId) {
      return item;
    }
    if (item.triggeredAt) {
      return item;
    }
    return { ...item, triggeredAt: new Date().toISOString() };
  });

  alertsBySession.set(sessionKey, updated);
}

export function getAlertLimit(): number {
  return MAX_ALERTS_PER_USER;
}
