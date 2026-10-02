export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getConnection } from "@/lib/solana";
import { checkGraduation } from "@/lib/launchpad/pump-curve-service";

/*
 * Real graduation detection - re-reads the bonding curve's own `complete`
 * flag live on every call (see pump-curve-service.checkGraduation), never
 * a stale DB row on its own. The first request to observe `graduated:
 * true` for a mint persists a GraduationEvent (upserted on mintAddress,
 * which is unique and can graduate at most once) so later reads and the
 * discovery "Graduated" filter have an indexed record to query instead of
 * re-deriving graduation state from scratch everywhere - the record is
 * only ever written from this independently-verified on-chain read, never
 * from a client claim.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-graduation" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  const check = await checkGraduation(getConnection(), mint);

  let event = null;
  if (check.graduated) {
    try {
      event = await prisma.graduationEvent.upsert({
        where: { mintAddress: mint },
        create: {
          mintAddress: mint,
          bondingCurveAddress: check.bondingCurveAddress,
          poolAddress: check.poolAddress,
          signature: check.anchorSignature,
          slot: check.anchorSlot,
          blockTime: check.anchorBlockTime,
        },
        update: {
          // A pool account can take a moment to appear after `complete`
          // flips - keep the record's pool fields current until it does.
          poolAddress: check.poolAddress,
        },
      });
    } catch (err: any) {
      // A concurrent request already upserted this mint, or the anchor
      // signature collided with another mint's record (astronomically
      // unlikely, but handled rather than 500ing) - fall back to reading
      // whatever is there instead of failing the whole response.
      if (err?.code === "P2002") {
        event = await prisma.graduationEvent.findUnique({ where: { mintAddress: mint } });
      } else {
        console.error("Graduation event upsert error:", err);
      }
    }
  } else {
    event = await prisma.graduationEvent.findUnique({ where: { mintAddress: mint } });
  }

  return NextResponse.json({ ...check, record: event });
}
