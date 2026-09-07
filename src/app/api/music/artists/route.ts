import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const mine = req.nextUrl.searchParams.get("mine") === "true";

  if (mine) {
    // The Music Studio's Artist Profile tab needs to preload the
    // current values before letting someone edit and save - without
    // this, saving would overwrite an existing bio/avatar/banner with
    // blank fields the form never actually loaded.
    const session = await (await import("next-auth")).getServerSession((await import("@/lib/auth")).authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const artist = await prisma.musicArtist.findUnique({ where: { userId: session.user.id } });
    return NextResponse.json(artist);
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  const sort = req.nextUrl.searchParams.get("sort") || "name";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 100);

  const artists = await prisma.musicArtist.findMany({
    where: q ? { displayName: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: sort === "popular" ? [{ followers: { _count: "desc" } }, { displayName: "asc" }] : { displayName: "asc" },
    take: limit,
    include: { _count: { select: { tracks: true, followers: true } } },
  });
  return NextResponse.json(artists);
}


export async function POST(req: NextRequest) {
  const session = await (await import("next-auth")).getServerSession((await import("@/lib/auth")).authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const displayName = String(body.displayName || session.user.name || session.user.username).trim().slice(0, 120);

  // This endpoint doubles as "apply for artist" (sends only displayName),
  // the track-publish and album-creation flows (send displayName or even
  // an empty body, just to get-or-create the caller's MusicArtist row),
  // and the actual Artist Profile settings save (sends bio/avatarUrl/
  // bannerUrl explicitly). Those first callers never included bio/avatar/
  // banner in the request, so unconditionally writing `body.bio || null`
  // etc. on every upsert wiped an existing artist's profile back to null
  // any time one of them ran. Only touch a field on update when the
  // caller actually included it in the request body; an explicit null
  // (Artist Profile settings clearing a field) still clears it.
  const profileUpdate: Record<string, string | null> = {};
  if ("bio" in body) profileUpdate.bio = body.bio || null;
  if ("avatarUrl" in body) profileUpdate.avatarUrl = body.avatarUrl || null;
  if ("bannerUrl" in body) profileUpdate.bannerUrl = body.bannerUrl || null;

  const artist = await prisma.musicArtist.upsert({
    where: { userId: session.user.id },
    update: { displayName, ...profileUpdate },
    create: { userId: session.user.id, displayName, bio: body.bio || null, avatarUrl: body.avatarUrl || null, bannerUrl: body.bannerUrl || null },
  });
  return NextResponse.json(artist);
}
