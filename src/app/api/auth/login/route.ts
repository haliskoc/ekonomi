import { NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { setAuthCookie, validateCredentials } from "@/lib/auth";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 5;

const loginSchema = z.object({
  email: z.string().trim().email("email is invalid"),
  password: z.string().min(1, "password is required"),
});

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `auth-login:${clientIp}`,
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
    const raw = await request.json();
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "invalid credentials", 400, {
        requestId,
        code: "INVALID_BODY",
      });
    }

    const { email, password } = parsed.data;
    const isValid = await validateCredentials(email, password);
    if (!isValid) {
      return jsonError("email or password is incorrect", 401, {
        requestId,
        code: "INVALID_CREDENTIALS",
      });
    }

    const response = jsonSuccess(
      {
        ok: true,
        requestId,
      },
      {
        requestId,
      }
    );

    setAuthCookie(response);
    return response;
  } catch {
    return jsonError("unexpected error", 500, {
      requestId,
      code: "INTERNAL_ERROR",
    });
  }
}
