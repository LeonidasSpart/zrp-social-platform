import { NextRequest, NextResponse } from "next/server";
import { AmbassadorStatus, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getCountryName } from "@/lib/ambassadors/countries";

const PROFILE_INCLUDE = {
  user: {
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      avatarUrl: true,
      badgeType: true,
      createdAt: true,
    },
  },
  reviewedBy: {
    select: { id: true, username: true, name: true },
  },
} as const;

/**
 * GET /api/admin/ambassadors
 *
 * List ambassador applications/profiles for the admin review queue.
 * Supports ?status= and ?search= (username/name/email), same shape as
 * GET /api/admin/journalists.
 */
export async function GET(request: NextRequest) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const search = searchParams.get("search")?.trim() || "";
    const pageParam = Number(searchParams.get("page") || "1");
    const limitParam = Number(searchParams.get("limit") || "20");

    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const limit =
      Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 100) : 20;

    const where: Prisma.AmbassadorProfileWhereInput = {
      ...(statusParam && Object.values(AmbassadorStatus).includes(statusParam as AmbassadorStatus)
        ? { status: statusParam as AmbassadorStatus }
        : {}),
      ...(search
        ? {
            user: {
              OR: [
                { username: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };

    const [profiles, total, statusCounts] = await Promise.all([
      prisma.ambassadorProfile.findMany({
        where,
        orderBy: [{ appliedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: PROFILE_INCLUDE,
      }),
      prisma.ambassadorProfile.count({ where }),
      prisma.ambassadorProfile.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const counts: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, SUSPENDED: 0 };
    for (const row of statusCounts) counts[row.status] = row._count._all;

    const profilesWithCountryName = profiles.map((p) => ({
      ...p,
      countryName: getCountryName(p.countryCode, "en") || p.countryCode,
    }));

    return NextResponse.json({
      success: true,
      profiles: profilesWithCountryName,
      counts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error("GET /api/admin/ambassadors error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load ambassador applications" },
      { status: 500 }
    );
  }
}
