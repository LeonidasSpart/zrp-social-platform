export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { rateLimit } from "@/lib/rate-limit";
import { getCachedTokenAnalytics } from "@/lib/launchpad/token-analytics";
import { TokenScanError } from "@/lib/launchpad/token-scanner";
import { SCAN_ERROR_STATUS, SCAN_ERROR_MESSAGE } from "@/lib/launchpad/token-scan-http";

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ─── GET: token intelligence for /launchpad/token/[mint] - real
// on-chain identity/risk/holders plus a live Jupiter price, cached
// briefly per mint (see token-analytics.ts). Public, read-only, no
// wallet or account needed. Any field that can't be independently
// verified comes back null + an explicit reason, never a fabricated
// number. ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 30, window: 60, type: "token-analytics" });
    if (!limitCheck.success) return limitCheck.response;

    const { mint } = await params;
    if (!isValidPublicKey(mint)) {
      return NextResponse.json({ error: SCAN_ERROR_MESSAGE.INVALID_MINT, code: "INVALID_MINT" }, { status: 400 });
    }

    const analytics = await getCachedTokenAnalytics(mint);
    return NextResponse.json(analytics);
  } catch (error) {
    if (error instanceof TokenScanError) {
      console.error(`Token analytics failed [${error.code}]:`, error.message, error.cause ?? "");
      return NextResponse.json(
        { error: SCAN_ERROR_MESSAGE[error.code], code: error.code },
        { status: SCAN_ERROR_STATUS[error.code] }
      );
    }
    console.error("Token analytics error (unclassified):", error);
    return NextResponse.json(
      { error: SCAN_ERROR_MESSAGE.INTERNAL_SCAN_ERROR, code: "INTERNAL_SCAN_ERROR" },
      { status: 500 }
    );
  }
}
