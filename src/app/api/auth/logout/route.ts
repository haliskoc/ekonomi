import { createRequestId, jsonSuccess } from "@/lib/api";
import { clearAuthCookie } from "@/lib/auth";

export async function POST() {
  const requestId = createRequestId();
  const response = jsonSuccess(
    {
      ok: true,
      requestId,
    },
    {
      requestId,
    }
  );

  clearAuthCookie(response);
  return response;
}
