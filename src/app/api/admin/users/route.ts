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

  const search = req.nextUrl.searchParams.get("search") || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
  const roleFilter = req.nextUrl.searchParams.get("role") || "ALL";
  const badgeFilter = req.nextUrl.searchParams.get("badge") || "ALL";
  const statusFilter = req.nextUrl.searchParams.get("status") || "ALL";

  try {
    // Search-only where clause: powers the stat cards, which should stay
    // a stable overview (e.g. "Admins: 1") regardless of which role/badge/
    // status filter is currently selected in the dropdowns below them.
    const searchWhere: Prisma.UserWhereInput = {};
    if (search) {
      searchWhere.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    // Fully filtered where clause: powers the actual table + pagination.
    // These filters used to only be applied client-side, after fetching
    // just one page of 20 users - so filtering for e.g. "Admins" could
    // show zero results if the one admin happened to be on a different
    // page. Now they're real database filters, matching every user that
    // qualifies regardless of which page they'd otherwise fall on.
    const where: Prisma.UserWhereInput = { ...searchWhere };
    if (roleFilter !== "ALL") {
      where.role = roleFilter as Prisma.UserWhereInput["role"];
    }
    if (badgeFilter !== "ALL") {
      where.badgeType = badgeFilter === "NONE" ? null : badgeFilter;
    }
    if (statusFilter === "ACTIVE") {
      where.banned = false;
    } else if (statusFilter === "BANNED") {
      where.banned = true;
    }

    const [users, total, searchTotal, active, banned, admins, mods] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          username: true,
          name: true,
          email: true,
          createdAt: true,
          isAdmin: true,          // kept for compatibility
          role: true,
          badgeType: true,
          plan: true,             // ✅ added (for plan management)
          banned: true,           // ✅ added (for status display)
          _count: {
            select: {
              posts: true,
              comments: true,
              reports: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
      // Stat card aggregates - always against searchWhere (search term
      // only), never the role/badge/status filters, so these numbers
      // don't shift around as the table filters change underneath them.
      prisma.user.count({ where: searchWhere }),
      prisma.user.count({ where: { ...searchWhere, banned: false } }),
      prisma.user.count({ where: { ...searchWhere, banned: true } }),
      prisma.user.count({ where: { ...searchWhere, role: "ADMIN" } }),
      prisma.user.count({ where: { ...searchWhere, role: "MODERATOR" } }),
    ]);

    return NextResponse.json({
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: { total: searchTotal, active, banned, admins, mods },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
