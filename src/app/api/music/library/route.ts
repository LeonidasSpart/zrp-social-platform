import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [likes, history, artistFollows] = await Promise.all([
    prisma.musicLike.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, include: { track: { include: { artist: true, album: true } } } }),
    prisma.musicHistory.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { track: { include: { artist: true, album: true } } } }),
    prisma.musicFollow.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, include: { artist: true } }),
  ]);

  return NextResponse.json({ likes, history, artistFollows });
}
