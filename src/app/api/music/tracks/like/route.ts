import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { trackId } = await req.json();
  if (!trackId) return NextResponse.json({ error: "trackId required" }, { status: 400 });

  const existing = await prisma.musicLike.findUnique({
    where: { userId_trackId: { userId: session.user.id, trackId } },
  });

  if (existing) {
    await prisma.musicLike.delete({ where: { id: existing.id } });
    return NextResponse.json({ liked: false });
  }

  await prisma.musicLike.create({ data: { userId: session.user.id, trackId } });
  return NextResponse.json({ liked: true });
}
