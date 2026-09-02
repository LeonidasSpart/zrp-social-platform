import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const title = String(body.title || "").trim().slice(0, 200);
  const audioUrl = String(body.audioUrl || "");
  const artistId = String(body.artistId || "");
  if (!title || !audioUrl || !artistId) return NextResponse.json({ error: "title, audioUrl and artistId are required" }, { status: 400 });

  const artist = await prisma.musicArtist.findFirst({ where: { id: artistId, userId: session.user.id } });
  if (!artist) return NextResponse.json({ error: "Artist profile not owned by current user" }, { status: 403 });

  const track = await prisma.musicTrack.create({
    data: {
      title, audioUrl, audioKey: body.audioKey || null, coverUrl: body.coverUrl || null,
      genre: body.genre || null, description: body.description || null, artistId,
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
