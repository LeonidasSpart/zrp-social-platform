import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const trackId = String(body.trackId || "");
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });

  const track = await prisma.musicTrack.update({
    where: { id: trackId },
    data: { playCount: { increment: 1 } },
    select: { id: true, playCount: true, durationSec: true },
  });

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    await prisma.musicHistory.create({
      data: {
        userId: session.user.id,
        trackId,
        secondsPlayed: Math.max(0, Number(body.secondsPlayed || 0)),
        completed: Boolean(body.completed),
      },
    });
  }

  return NextResponse.json(track);
}
