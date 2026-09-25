import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { trackId } = await req.json();
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });

  const existing = await prisma.musicLike.findUnique({
    where: { userId_trackId: { userId: session.user.id, trackId } },
  });

  if (existing) {
    await prisma.musicLike.deleteMany({ where: { id: existing.id } });
    return NextResponse.json({ liked: false });
  }

  // Only a published track can be liked - an unknown id used to fail the
  // foreign key with an unhandled 500, and a double tap raced into a
  // unique-constraint 500 that made the client revert a saved like.
  const track = await prisma.musicTrack.findFirst({
    where: { id: String(trackId), status: "PUBLISHED" },
    select: { id: true },
  });
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  try {
    await prisma.musicLike.create({ data: { userId: session.user.id, trackId: track.id } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
  return NextResponse.json({ liked: true });
}
