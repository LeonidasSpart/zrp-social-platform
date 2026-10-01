export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { computeProposalStatus } from "@/lib/launchpad/dao-service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const proposal = await prisma.daoProposal.findUnique({
      where: { id },
      include: {
        dao: {
          include: {
            launchedToken: { select: { id: true, name: true, symbol: true, imageUrl: true, mintAddress: true, decimals: true } },
          },
        },
      },
    });

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
    }

    const status = computeProposalStatus(proposal, proposal.dao.quorumRaw);

    return jsonWithDecimalStrings({ proposal: { ...proposal, status } });
  } catch (error) {
    console.error("Error fetching DAO proposal:", error);
    return NextResponse.json({ error: "Failed to fetch proposal" }, { status: 500 });
  }
}
