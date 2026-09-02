import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  const playlist = await prisma.musicPlaylist.findUnique({
    where: { id },
    include: {
      tracks: { orderBy: { position: "asc" }, include: { track: { include: { artist: true, album: true } } } },
    },
  });

  if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = session?.user?.id === playlist.userId;
  if (!playlist.isPublic && !isOwner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ...playlist, isOwner });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const playlist = await prisma.musicPlaylist.findFirst({ where: { id, userId: session.user.id } });
  if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: { name?: string; description?: string | null; isPublic?: boolean; coverUrl?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 100);
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    data.name = name;
  }
  if (typeof body.description === "string" || body.description === null) data.description = body.description;
  if (typeof body.isPublic === "boolean") data.isPublic = body.isPublic;
  if (typeof body.coverUrl === "string" || body.coverUrl === null) data.coverUrl = body.coverUrl;

  const updated = await prisma.musicPlaylist.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const playlist = await prisma.musicPlaylist.findFirst({ where: { id, userId: session.user.id } });
  if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.musicPlaylist.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}

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
