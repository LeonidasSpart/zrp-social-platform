export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { computeProposalStatus } from "@/lib/launchpad/dao-service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const dao = await prisma.dao.findUnique({
      where: { id },
      include: {
        launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
        creator: { select: { id: true, username: true, name: true, avatarUrl: true } },
        proposals: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!dao) {
      return NextResponse.json({ error: "DAO not found." }, { status: 404 });
    }

    const proposals = dao.proposals.map((p) => ({ ...p, status: computeProposalStatus(p, dao.quorumRaw) }));

    return jsonWithDecimalStrings({ dao: { ...dao, proposals } });
  } catch (error) {
    console.error("Error fetching DAO:", error);
    return NextResponse.json({ error: "Failed to fetch DAO" }, { status: 500 });
  }
}
