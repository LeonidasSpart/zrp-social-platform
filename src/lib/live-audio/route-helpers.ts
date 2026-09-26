import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";
import { LiveAudioError, liveAudioErrorResponseBody } from "./errors";

/**
 * Every Live Audio route follows the same shape: authenticate + confirm
 * not-banned (requireActiveUser, always fresh - see docs §7 on why a
 * banned user must never keep acting on a cached view of themselves),
 * then run the actual handler and map any LiveAudioError to its typed
 * response. Centralizing this means every route gets the same
 * "never leak internal infrastructure details" behavior (mission §23)
 * for free, rather than each one hand-rolling its own try/catch.
 */
export async function withLiveAudioAuth(
  handler: (userId: string) => Promise<NextResponse>
): Promise<NextResponse> {
  const auth = await requireActiveUser();
  if (!auth.ok) return auth.response;

  try {
    return await handler(auth.userId);
  } catch (err) {
    if (err instanceof LiveAudioError) {
      const headers = err.code === "rate_limited" ? { "Retry-After": String((err as LiveAudioError & { retryAfter: number }).retryAfter) } : undefined;
      return NextResponse.json(liveAudioErrorResponseBody(err), { status: err.status, headers });
    }
    console.error("Live Audio route error:", err);
    return NextResponse.json({ error: "Internal server error", code: "internal_error" }, { status: 500 });
  }
}

/** Thin wrapper so route-level rate limiting reads the same as every other route in the app. */
export async function checkRateLimit(
  req: NextRequest,
  config: { limit: number; window: number; type: string }
): Promise<NextResponse | null> {
  const result = await rateLimit(req, config);
  return result.success ? null : result.response!;
}
