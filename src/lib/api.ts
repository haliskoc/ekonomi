import { NextRequest, NextResponse } from "next/server";

type JsonPayload = Record<string, unknown>;

type JsonOptions = {
  status?: number;
  requestId: string;
  headers?: HeadersInit;
};

export function mergeHeaders(base: HeadersInit | undefined, requestId: string): Headers {
  const headers = new Headers(base);
  headers.set("x-request-id", requestId);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "no-referrer");
  return headers;
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function getClientIp(request: NextRequest): string {
  // To prevent IP spoofing, we should look at x-real-ip first if set by our trusted proxy
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // Fallback to x-forwarded-for. To avoid spoofing, we take the right-most IP
  // (or Next.js normalized string, but safely handling it)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor.split(",");
    const rightMost = parts[parts.length - 1]?.trim();
    if (rightMost) {
      return rightMost;
    }
  }

  return "unknown";
}

export function jsonSuccess(payload: JsonPayload, options: JsonOptions): NextResponse {
  const headers = mergeHeaders(options.headers, options.requestId);
  return NextResponse.json(payload, { status: options.status ?? 200, headers });
}

export function jsonError(
  message: string,
  status: number,
  options: JsonOptions & { code?: string }
): NextResponse {
  const body: JsonPayload = {
    error: message,
    requestId: options.requestId,
  };

  if (options.code) {
    body.code = options.code;
  }

  const headers = mergeHeaders(options.headers, options.requestId);
  return NextResponse.json(body, { status, headers });
}
