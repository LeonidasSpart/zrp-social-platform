export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";

/*
 * A recent blockhash, proxied from this server's own Connection, for a
 * client (native Android/iOS, which hold no Solana RPC URL or API key of
 * their own) to compile an unsigned ZRP Launchpad transaction locally
 * before handing it to Mobile Wallet Adapter / the platform wallet-adapter
 * for signing. A blockhash is not sensitive - it is public chain state,
 * valid for ~60-90 seconds for any transaction, from any sender - so this
 * route needs no auth, only abuse-rate-limiting like every other public
 * GET in this directory (holders, metadata.json).
 */
export async function GET(req: NextRequest) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-blockhash" });
  if (!limitCheck.success) return limitCheck.response;

  const { blockhash } = await getConnection().getLatestBlockhash();
  return NextResponse.json({ blockhash });
}
