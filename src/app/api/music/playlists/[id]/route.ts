import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const playlist = await prisma.musicPlaylist.findFirst({ where: { id, userId: session.user.id } });
  if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const trackId = String(body.trackId || "");
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });

  const exists = await prisma.musicPlaylistTrack.findUnique({
    where: { playlistId_trackId: { playlistId: id, trackId } },
  });
  if (exists) {
    await prisma.musicPlaylistTrack.delete({ where: { id: exists.id } });
    return NextResponse.json({ added: false });
  }

  const last = await prisma.musicPlaylistTrack.findFirst({ where: { playlistId: id }, orderBy: { position: "desc" } });
  const item = await prisma.musicPlaylistTrack.create({
    data: { playlistId: id, trackId, position: (last?.position ?? -1) + 1 },
  });
  return NextResponse.json({ added: true, item });
}
