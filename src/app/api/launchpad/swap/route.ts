export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { rateLimit } from "@/lib/rate-limit";
import { getSwapTransaction } from "@/lib/launchpad/dex-aggregator";

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/*
 * POST: builds (but never signs) the actual swap transaction, with the
 * caller's own wallet as fee payer and sole signer - Jupiter assembles
 * it, we only relay it. `quoteResponse` is the opaque SwapQuote.raw blob
 * from a prior GET .../quote call, echoed back verbatim; we don't trust
 * or interpret it beyond passing it through, and nothing here touches
 * the database or moves any funds - that only happens when the browser
 * has the user's own wallet sign and broadcast the transaction this
 * returns (see src/lib/launchpad/client-swap.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const limitCheck = await rateLimit(req, { limit: 15, window: 60, type: "swap-execute" });
    if (!limitCheck.success) return limitCheck.response;

    const body = await req.json().catch(() => null);
    const userPublicKey = body?.userPublicKey;
    const quoteResponse = body?.quoteResponse;

    if (!isValidPublicKey(userPublicKey)) {
      return NextResponse.json({ error: "A valid userPublicKey is required." }, { status: 400 });
    }
    if (!quoteResponse || typeof quoteResponse !== "object") {
      return NextResponse.json({ error: "A valid quoteResponse is required." }, { status: 400 });
    }

    const swapTransaction = await getSwapTransaction({ quoteResponse, userPublicKey });
    return NextResponse.json(swapTransaction);
  } catch (error) {
    console.error("Swap transaction build error:", error);
    return NextResponse.json({ error: "Failed to build the swap transaction. Please try again." }, { status: 502 });
  }
}
