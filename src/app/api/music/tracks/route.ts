import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMusicPublishAccess, MUSIC_PUBLISH_DENIED_MESSAGE } from "@/lib/music/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same publish gate as the UploadThing middleware: derived only from
  // the authenticated session, never from the request body. A user
  // could otherwise reuse a previously-uploaded audioUrl to call this
  // route directly and publish without ever having permission.
  const access = await getMusicPublishAccess(session.user.id);
  if (!access.allowed) {
    return NextResponse.json({ error: MUSIC_PUBLISH_DENIED_MESSAGE }, { status: 403 });
  }

  const body = await req.json();
  const title = String(body.title || "").trim().slice(0, 200);
  const audioUrl = String(body.audioUrl || "");
  const artistId = String(body.artistId || "");
  if (!title || !audioUrl || !artistId) return NextResponse.json({ error: "title, audioUrl and artistId are required" }, { status: 400 });

  const artist = await prisma.musicArtist.findFirst({ where: { id: artistId, userId: session.user.id } });
  if (!artist) return NextResponse.json({ error: "Artist profile not owned by current user" }, { status: 403 });

  const track = await prisma.musicTrack.create({
    data: {
      title, audioUrl, audioKey: body.audioKey || null,
      coverUrl: body.coverUrl || null, coverKey: body.coverKey || null,
      genre: body.genre || null, description: body.description || null, artistId,
      explicit: !!body.explicit,
      status: "PUBLISHED",
    },
    include: { artist: true, album: true },
  });
  return NextResponse.json(track, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 30), 100);
  const mine = req.nextUrl.searchParams.get("mine") === "true";

  // "mine" is the Music Studio's own-tracks view: every track owned by
  // the current session's artist profile, any status, not just
  // PUBLISHED - so an artist can see and manage a track that's still
  // processing or was unpublished. Ownership comes only from the
  // session, never a client-supplied artistId.
  if (mine) {
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const artist = await prisma.musicArtist.findUnique({ where: { userId: session.user.id }, select: { id: true } });
    if (!artist) return NextResponse.json([]);

    const tracks = await prisma.musicTrack.findMany({
      where: { artistId: artist.id },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      include: { artist: true, album: true },
    });
    return NextResponse.json(tracks);
  }

  const tracks = await prisma.musicTrack.findMany({
    where: {
      status: "PUBLISHED",
      ...(q ? {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { genre: { contains: q, mode: "insensitive" } },
          { artist: { displayName: { contains: q, mode: "insensitive" } } },
        ],
      } : {}),
    },
    orderBy: [{ playCount: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      artist: true,
      album: true,
      ...(session?.user?.id ? { likes: { where: { userId: session.user.id }, select: { id: true } } } : {}),
    },
  });

  return NextResponse.json(tracks.map(t => ({
    ...t,
    liked: "likes" in t ? (t.likes as {id:string}[]).length > 0 : false,
    likes: undefined,
  })));
}
