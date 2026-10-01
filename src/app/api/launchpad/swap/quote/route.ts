export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { rateLimit } from "@/lib/rate-limit";
import { getSwapQuote, buildJupiterSwapLink } from "@/lib/launchpad/dex-aggregator";

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ─── GET: a read-only best-price-across-DEXs quote via Jupiter - no
// custody, no transaction, nothing to sign. Execution happens on
// Jupiter's own app via the returned swapLink. ─────────────────────────
export async function GET(req: NextRequest) {
  try {
    const limitCheck = await rateLimit(req, { limit: 30, window: 60, type: "swap-quote" });
    if (!limitCheck.success) return limitCheck.response;

    const inputMint = req.nextUrl.searchParams.get("inputMint");
    const outputMint = req.nextUrl.searchParams.get("outputMint");
    const amount = req.nextUrl.searchParams.get("amount");

    if (!isValidPublicKey(inputMint)) {
      return NextResponse.json({ error: "A valid inputMint is required." }, { status: 400 });
    }
    if (!isValidPublicKey(outputMint)) {
      return NextResponse.json({ error: "A valid outputMint is required." }, { status: 400 });
    }
    if (!amount || !/^[1-9]\d*$/.test(amount) || amount.length > 20) {
      return NextResponse.json({ error: "A valid raw token amount is required." }, { status: 400 });
    }

    const quote = await getSwapQuote({ inputMint, outputMint, amountRaw: amount });
    const swapLink = buildJupiterSwapLink(inputMint, outputMint);

    return NextResponse.json({ quote, swapLink });
  } catch (error) {
    console.error("Swap quote error:", error);
    return NextResponse.json({ error: "Failed to fetch a swap quote. Please try again." }, { status: 502 });
  }
}
