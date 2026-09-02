import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  const statusParam = req.nextUrl.searchParams.get("status") || "PENDING_REVIEW";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  try {
    const where: Prisma.OpportunityListingWhereInput = {};
    if (statusParam !== "all") {
      where.status = statusParam as Prisma.OpportunityListingWhereInput["status"];
    }

    const [listings, total] = await Promise.all([
      prisma.opportunityListing.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          poster: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
        },
      }),
      prisma.opportunityListing.count({ where }),
    ]);

    return NextResponse.json({ listings, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error fetching opportunity listings for review:", error);
    return NextResponse.json({ error: "Failed to fetch listings" }, { status: 500 });
  }
}
