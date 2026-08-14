import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const search = req.nextUrl.searchParams.get("search") || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  try {
    const where: Prisma.UserWhereInput = {};
    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total, active, banned, admins, mods] = await Promise.all([
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
      // Aggregate counts across the whole filtered result set, not just
      // the current page - the stat cards were previously computed by
      // filtering the current page's 20 users client-side, so "Total"
      // could never show more than the page size regardless of how many
      // users actually exist.
      prisma.user.count({ where: { ...where, banned: false } }),
      prisma.user.count({ where: { ...where, banned: true } }),
      prisma.user.count({ where: { ...where, role: "ADMIN" } }),
      prisma.user.count({ where: { ...where, role: "MODERATOR" } }),
    ]);

    return NextResponse.json({
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: { total, active, banned, admins, mods },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
