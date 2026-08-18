import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
  const check = await requireStaff();
  if (!check.authorized) return check.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  try {
    const { action, rejectionReason } = await req.json();
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
    }

    const campaign = await prisma.adCampaign.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.status !== "PENDING_REVIEW") {
      return NextResponse.json(
        { error: "Only campaigns pending review can be approved or rejected." },
        { status: 400 }
      );
    }

    const updated = await prisma.adCampaign.update({
      where: { id },
      data: {
        status: action === "approve" ? "ACTIVE" : "REJECTED",
        rejectionReason: action === "reject" ? (rejectionReason || null) : null,
        reviewedBy: token?.id as string | undefined,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ campaign: updated });
  } catch (error) {
    console.error("Error reviewing ad campaign:", error);
    return NextResponse.json({ error: "Failed to review campaign" }, { status: 500 });
  }
}
