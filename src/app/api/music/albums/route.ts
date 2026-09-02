import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMusicPublishAccess, MUSIC_PUBLISH_DENIED_MESSAGE } from "@/lib/music/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 30), 100);

  const albums = await prisma.musicAlbum.findMany({
    where: q ? { title: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { artist: true, _count: { select: { tracks: true } } },
  });

  return NextResponse.json(albums);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getMusicPublishAccess(session.user.id);
  if (!access.allowed) {
    return NextResponse.json({ error: MUSIC_PUBLISH_DENIED_MESSAGE }, { status: 403 });
  }

  const body = await req.json();
  const artistId = String(body.artistId || "");
  const title = String(body.title || "").trim().slice(0, 150);
  if (!artistId || !title) {
    return NextResponse.json({ error: "artistId and title are required" }, { status: 400 });
  }

  const artist = await prisma.musicArtist.findFirst({ where: { id: artistId, userId: session.user.id } });
  if (!artist) return NextResponse.json({ error: "Artist profile not owned by current user" }, { status: 403 });

  const album = await prisma.musicAlbum.create({
    data: {
      artistId,
      title,
      description: body.description || null,
      coverUrl: body.coverUrl || null,
      releaseDate: body.releaseDate ? new Date(body.releaseDate) : null,
    },
  });

  return NextResponse.json(album, { status: 201 });
}
