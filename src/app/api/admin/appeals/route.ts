import { NextRequest, NextResponse } from "next/server";
// requireStaff (ADMIN or MODERATOR) - same access level as report review,
// which this extends.
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  const statusParam = req.nextUrl.searchParams.get("status") || "pending";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  try {
    const where: Prisma.AppealWhereInput = {};
    if (statusParam !== "all") {
      where.status = statusParam;
    }

    const [appeals, total] = await Promise.all([
      prisma.appeal.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, username: true, name: true } },
          report: {
            select: {
              id: true,
              reason: true,
              actionType: true,
              actionNote: true,
              actionedAt: true,
            },
          },
        },
      }),
      prisma.appeal.count({ where }),
    ]);

    return NextResponse.json({ appeals, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error fetching appeals:", error);
    return NextResponse.json({ error: "Failed to fetch appeals" }, { status: 500 });
  }
}
