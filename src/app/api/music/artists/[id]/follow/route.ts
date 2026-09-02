import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const artist = await prisma.musicArtist.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  if (artist.userId === session.user.id) {
    return NextResponse.json({ error: "You cannot follow your own artist profile" }, { status: 400 });
  }

  const existing = await prisma.musicFollow.findUnique({
    where: { userId_artistId: { userId: session.user.id, artistId: id } },
  });

  if (existing) {
    await prisma.musicFollow.delete({ where: { id: existing.id } });
    return NextResponse.json({ following: false });
  }

  await prisma.musicFollow.create({ data: { userId: session.user.id, artistId: id } });
  return NextResponse.json({ following: true });
}
