export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ mint: string }> }) {
  const limitCheck = await rateLimit(req, { limit: 60, window: 60, type: "launchpad-token-pools" });
  if (!limitCheck.success) return limitCheck.response;

  const { mint } = await params;
  const pools = await prisma.tokenPool.findMany({
    where: { status: "ACTIVE", OR: [{ baseMint: mint }, { quoteMint: mint }] },
    orderBy: { createdAt: "desc" },
  });

  return jsonWithDecimalStrings({ pools });
}
