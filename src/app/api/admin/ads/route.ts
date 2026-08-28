import { NextRequest, NextResponse } from "next/server";
// requireStaff (ADMIN or MODERATOR) - reviewing ad submissions is content
// moderation work, same category as reviewing reports/posts elsewhere in
// this app. Approving/rejecting real money campaigns still goes through
// this same staff-level check, not requireAdmin - a moderator should be
// able to keep the review queue moving day to day.
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

export async function GET(req: NextRequest) {
  const check = await requireStaff();
  if (!check.authorized) return check.response;

  const statusParam = req.nextUrl.searchParams.get("status") || "PENDING_REVIEW";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  try {
    const where = statusParam === "all" ? {} : { status: statusParam as any };

    const [campaigns, total] = await Promise.all([
      prisma.adCampaign.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "asc" },
        include: {
          advertiser: {
            select: { id: true, username: true, name: true, email: true },
          },
          post: {
            select: {
              id: true,
              content: true,
              imageUrl: true,
              imageUrls: true,
              mediaType: true,
            },
          },
        },
      }),
      prisma.adCampaign.count({ where }),
    ]);

    return jsonWithDecimals({ campaigns, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error fetching ad review queue:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
