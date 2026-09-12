import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const community = await prisma.community.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { id: true },
    });
    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const existing = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId } },
    });
    if (existing) {
      return NextResponse.json({ isMember: true, alreadyMember: true });
    }

    // ─── Atomic join + counter bump, no read-then-write race ───────
    await prisma.$transaction([
      prisma.communityMember.create({
        data: { communityId: community.id, userId, role: "MEMBER" },
      }),
      prisma.community.update({
        where: { id: community.id },
        data: { memberCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json({ isMember: true, alreadyMember: false });
  } catch (error) {
    console.error("Error joining community:", error);
    return NextResponse.json({ error: "Failed to join community" }, { status: 500 });
  }
}
