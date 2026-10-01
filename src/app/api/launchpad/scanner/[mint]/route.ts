export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { rateLimit } from "@/lib/rate-limit";
import { scanToken } from "@/lib/launchpad/token-scanner";

function isValidPublicKey(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

// ─── GET: read-only on-chain inspection of any SPL token - public, no
// account needed, no custody, nothing to sign. ─────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  try {
    const limitCheck = await rateLimit(req, { limit: 20, window: 60, type: "token-scanner" });
    if (!limitCheck.success) return limitCheck.response;

    const { mint } = await params;
    if (!isValidPublicKey(mint)) {
      return NextResponse.json({ error: "Invalid mint address." }, { status: 400 });
    }

    const result = await scanToken(mint);
    return NextResponse.json({ scan: result });
  } catch (error) {
    console.error("Token scan error:", error);
    return NextResponse.json({ error: "Failed to scan this token. It may not exist or the RPC is unavailable." }, { status: 502 });
  }
}
