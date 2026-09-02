import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playlists = await prisma.musicPlaylist.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { tracks: { orderBy: { position: "asc" }, include: { track: { include: { artist: true, album: true } } } } },
  });
  return NextResponse.json(playlists);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const name = String(body.name || "").trim().slice(0, 100);
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const playlist = await prisma.musicPlaylist.create({
    data: { userId: session.user.id, name, description: body.description || null, isPublic: body.isPublic !== false },
  });
  return NextResponse.json(playlist);
}
