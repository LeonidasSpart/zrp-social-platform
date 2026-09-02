import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  const statusParam = req.nextUrl.searchParams.get("status") || "PENDING_REVIEW";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  try {
    const where: Prisma.HelpCampaignWhereInput = {};
    if (statusParam !== "all") {
      where.status = statusParam as Prisma.HelpCampaignWhereInput["status"];
    }

    const [campaigns, total] = await Promise.all([
      prisma.helpCampaign.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          organizer: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
        },
      }),
      prisma.helpCampaign.count({ where }),
    ]);

    return jsonWithDecimals({ campaigns, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error fetching HELP campaigns for review:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
