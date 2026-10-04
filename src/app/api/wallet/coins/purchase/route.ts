export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-guards";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";
import { purchaseCoins } from "@/lib/live-gifts/gift-service";
import { LiveAudioError, liveAudioErrorResponseBody } from "@/lib/live-audio/errors";

/**
 * Tops up the caller's ZRP coin balance from a real on-chain USDC
 * payment - same verification/idempotency rigor as /api/creator/tip,
 * see gift-service.ts's purchaseCoins() for the shared logic.
 */
export async function POST(req: NextRequest) {
  const auth = await requireActiveUser();
  if (!auth.ok) return auth.response;

  // Real RPC + DB work per call, same cap as the tip route.
  const limit = await rateLimitByIpAndUser(req, auth.userId, { limit: 10, window: 60, type: "coin-purchase" });
  if (!limit.success) return limit.response;

  // Same store-policy reasoning as /api/creator/tip - a real-money
  // top-up surface, blocked for the native app.
  const nativeBlock = rejectNativePayment(req);
  if (nativeBlock) return nativeBlock;

  const body = await req.json().catch(() => null);
  const transactionId = body?.transactionId;
  const packageKey = typeof body?.packageKey === "string" && body.packageKey ? body.packageKey : undefined;

  try {
    const result = await purchaseCoins({ userId: auth.userId, transactionId, packageKey });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof LiveAudioError) {
      return NextResponse.json(liveAudioErrorResponseBody(err), { status: err.status });
    }
    console.error("Coin purchase error:", err);
    return NextResponse.json({ error: "Failed to process purchase. Please try again." }, { status: 500 });
  }
}
