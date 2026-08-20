import { NextRequest, NextResponse } from "next/server";
import { JournalistStatus, Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { syncJournalistBadge } from "@/lib/journalist";

const PROFILE_INCLUDE = {
  user: {
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      avatarUrl: true,
      badgeType: true,
      role: true,
      createdAt: true,
    },
  },
  reviewedBy: {
    select: { id: true, username: true, name: true },
  },
} as const;

/**
 * GET /api/admin/journalists
 *
 * List journalist applications/profiles for the admin review queue.
 * Supports ?status= and ?search= (username/name/email).
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

    const where: Prisma.JournalistProfileWhereInput = {
      ...(statusParam && Object.values(JournalistStatus).includes(statusParam as JournalistStatus)
        ? { status: statusParam as JournalistStatus }
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
      prisma.journalistProfile.findMany({
        where,
        orderBy: [{ appliedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: PROFILE_INCLUDE,
      }),
      prisma.journalistProfile.count({ where }),
      prisma.journalistProfile.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const counts: Record<string, number> = { PENDING: 0, VERIFIED: 0, REJECTED: 0, SUSPENDED: 0 };
    for (const row of statusCounts) counts[row.status] = row._count._all;

    return NextResponse.json({
      success: true,
      profiles,
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
    console.error("GET /api/admin/journalists error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load journalist applications" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/journalists
 *
 * Admin-initiated grant: directly makes an existing user a VERIFIED
 * journalist without them submitting an application (e.g. onboarding
 * a known reporter). Body: { username } or { userId }.
 */
export async function POST(request: NextRequest) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const body = await request.json().catch(() => ({}));
    const { username, userId } = body;

    if (!username && !userId) {
      return NextResponse.json(
        { success: false, error: "username or userId is required" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: userId ? { id: String(userId) } : { username: String(username).trim() },
      select: { id: true },
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const existing = await prisma.journalistProfile.findUnique({
      where: { userId: targetUser.id },
    });

    if (existing?.status === "VERIFIED") {
      return NextResponse.json(
        { success: false, error: "This user is already a verified journalist." },
        { status: 409 }
      );
    }

    const [profile] = await prisma.$transaction([
      existing
        ? prisma.journalistProfile.update({
            where: { userId: targetUser.id },
            data: {
              status: "VERIFIED",
              reviewedAt: new Date(),
              reviewedById: adminCheck.session.user.id,
              rejectionReason: null,
              suspensionReason: null,
            },
            include: PROFILE_INCLUDE,
          })
        : prisma.journalistProfile.create({
            data: {
              userId: targetUser.id,
              status: "VERIFIED",
              reviewedAt: new Date(),
              reviewedById: adminCheck.session.user.id,
            },
            include: PROFILE_INCLUDE,
          }),
      prisma.user.update({ where: { id: targetUser.id }, data: { role: "JOURNALIST" } }),
    ]);

    await syncJournalistBadge(targetUser.id, "VERIFIED");

    return NextResponse.json({ success: true, profile }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/journalists error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to grant journalist status" },
      { status: 500 }
    );
  }
}
