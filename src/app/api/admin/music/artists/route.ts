import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  const statusParam = req.nextUrl.searchParams.get("status") || "all";
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20"), 100);

  const where = {
    ...(statusParam === "verified" ? { verified: true } : {}),
    ...(statusParam === "unverified" ? { verified: false } : {}),
    ...(q
      ? { displayName: { contains: q, mode: "insensitive" as const } }
      : {}),
  };

  const [artists, total] = await Promise.all([
    prisma.musicArtist.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, username: true, name: true, avatarUrl: true, email: true } },
        _count: { select: { tracks: true, followers: true } },
      },
    }),
    prisma.musicArtist.count({ where }),
  ]);

  return NextResponse.json({ artists, total, page, totalPages: Math.ceil(total / limit) });
}
