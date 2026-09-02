import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.musicTrack.groupBy({
    by: ["genre"],
    where: { status: "PUBLISHED", genre: { not: null } },
    _count: { genre: true },
    orderBy: { _count: { genre: "desc" } },
  });

  const genres = rows
    .filter((r) => r.genre)
    .map((r) => ({ genre: r.genre as string, count: r._count.genre }));

  return NextResponse.json(genres);
}
