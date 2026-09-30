import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Same follow-spam/notification-amplification gap as
  // users/[username]/follow - no other reaction endpoint in the
  // codebase is unprotected like this one was.
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "follow-toggle" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const artist = await prisma.musicArtist.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  if (artist.userId === session.user.id) {
    return NextResponse.json({ error: "You cannot follow your own artist profile" }, { status: 400 });
  }

  const existing = await prisma.musicFollow.findUnique({
    where: { userId_artistId: { userId: session.user.id, artistId: id } },
  });

  if (existing) {
    await prisma.musicFollow.deleteMany({ where: { id: existing.id } });
    return NextResponse.json({ following: false });
  }

  try {
    await prisma.musicFollow.create({ data: { userId: session.user.id, artistId: id } });
  } catch (err) {
    // A concurrent follow (double tap) already created it - not a 500.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
  return NextResponse.json({ following: true });
}
