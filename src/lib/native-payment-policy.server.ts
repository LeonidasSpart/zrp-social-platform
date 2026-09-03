import { NextRequest, NextResponse } from "next/server";
import { NATIVE_PAYMENT_HEADER, NATIVE_PAYMENT_DISABLED_CODE } from "./native-payment-policy";

/**
 * Server-side half of the native payment policy (kept in its own file
 * since it imports next/server, which can't be pulled into a client
 * component - see native-payment-policy.ts for the client-safe half and
 * the reasoning behind which features are restricted).
 *
 * Call this at the top of any store-sensitive payment route, right after
 * auth. Returns a 403 response to short-circuit the request if it
 * self-identifies as coming from the native app, or null to proceed
 * normally. This header is a defense-in-depth signal only, not proof of
 * client identity - real security still comes entirely from the existing
 * server-side session check and independent on-chain transaction
 * verification in each route, both unchanged by this.
 */
export function rejectNativePayment(req: NextRequest): NextResponse | null {
  if (req.headers.get(NATIVE_PAYMENT_HEADER) !== "1") {
    return null;
  }

  return NextResponse.json(
    {
      error: "This action is not available in the ZRP app right now.",
      code: NATIVE_PAYMENT_DISABLED_CODE,
    },
    { status: 403 }
  );
}
