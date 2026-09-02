import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";
import { createNotification } from "@/lib/notifications";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireStaff();
  if (!adminCheck.authorized) return adminCheck.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const verified = Boolean(body.verified);

  const artist = await prisma.musicArtist.findUnique({ where: { id } });
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  const updated = await prisma.musicArtist.update({
    where: { id },
    data: { verified },
  });

  await logAdminAction({
    actor: adminCheck.session,
    action: verified ? "music_artist_verify" : "music_artist_unverify",
    targetType: "MusicArtist",
    targetId: id,
    metadata: { displayName: artist.displayName, userId: artist.userId },
  });

  if (verified) {
    await createNotification({
      userId: artist.userId,
      type: "music_artist_verified",
      fromUserId: adminCheck.session.user.id,
    });
  }

  return NextResponse.json(updated);
}
