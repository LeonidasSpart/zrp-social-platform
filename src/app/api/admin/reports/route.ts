import { NextRequest, NextResponse } from "next/server";
// requireStaff (ADMIN or MODERATOR) - this is core content-moderation work.
// Sensitive/financial admin routes (roles, plan changes, payments, analytics)
// stay on requireAdmin.
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
    const where: Prisma.ReportWhereInput = {};
    // Only apply filter if statusParam is NOT "all"
    if (statusParam !== "all") {
      where.status = statusParam as any; // "pending", "reviewed", "dismissed"
    }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" }, // newest first
        include: {
          reporter: {
            select: { id: true, username: true, name: true },
          },
          post: {
            include: {
              author: { select: { id: true, username: true, name: true } },
            },
          },
          comment: {
            include: {
              author: { select: { id: true, username: true, name: true } },
            },
          },
        },
      }),
      prisma.report.count({ where }),
    ]);

    return NextResponse.json({ reports, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}
