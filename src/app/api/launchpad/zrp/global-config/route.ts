export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";
import { getZrpGlobalConfig } from "@/lib/launchpad/zrp-launch-service";
import { ZRP_LAUNCH_PROGRAM_ID } from "@/lib/launchpad/zrp-launch-keys";

/*
 * ZRP Launchpad's on-chain GlobalConfig plus the program ID currently in
 * effect, read-only - specifically the fields a client needs to build its
 * own create/buy/sell instruction (feeRecipient is one of the accounts
 * every one of those instructions requires) without holding a Solana RPC
 * connection, or its own NEXT_PUBLIC_ZRP_LAUNCH_PROGRAM_ID build-time
 * config, of its own. Mirrors client-zrp-launch.ts's own
 * loadGlobalConfig() (browser, direct RPC against the program ID baked
 * into its own build) for a client (native Android/iOS) that has neither
 * - see the blockhash route's own comment for why that's the deliberate
 * shape of this app's trust model: the backend is always the single
 * source of truth for "which program/cluster is this build pointed at,"
 * so a native client can never go stale against a devnet/mainnet program
 * ID switch the way a hardcoded client-side constant could. None of this
 * is sensitive: it is public program configuration, identical for every
 * caller, and getZrpGlobalConfig() already applies its own 30s cache so
 * this adds no meaningful extra RPC load.
 */
export async function GET(req: NextRequest) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-zrp-global-config" });
  if (!limitCheck.success) return limitCheck.response;

  const config = await getZrpGlobalConfig(getConnection());
  return NextResponse.json({
    programId: ZRP_LAUNCH_PROGRAM_ID.toBase58(),
    feeRecipient: config.feeRecipient.toBase58(),
    buyFeeBps: config.buyFeeBps,
    sellFeeBps: config.sellFeeBps,
    creationFeeLamports: config.creationFeeLamports.toString(),
  });
}
