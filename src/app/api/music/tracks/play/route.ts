import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const trackId = String(body.trackId || "");
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });

  // Self-healing backfill for MusicTrack.durationSec: tracks published
  // before duration was captured at upload time (or any upload where
  // the browser couldn't determine it) permanently showed "--:--" in
  // every track list with no way to fix it short of re-uploading. Any
  // listener's browser reporting the real duration it just decoded is
  // a reliable, self-correcting source - sanity-bounded, and only
  // ever applied when nothing is stored yet, so it can't be used to
  // overwrite a real value.
  const existing = await prisma.musicTrack.findUnique({ where: { id: trackId }, select: { durationSec: true } });
  if (!existing) return NextResponse.json({ error: "Track not found" }, { status: 404 });

  const reportedDuration = Number(body.durationSec);
  const shouldBackfillDuration =
    !existing.durationSec &&
    Number.isFinite(reportedDuration) &&
    reportedDuration > 0 &&
    reportedDuration < 6 * 60 * 60;

  const track = await prisma.musicTrack.update({
    where: { id: trackId },
    data: {
      playCount: { increment: 1 },
      ...(shouldBackfillDuration ? { durationSec: Math.round(reportedDuration) } : {}),
    },
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
