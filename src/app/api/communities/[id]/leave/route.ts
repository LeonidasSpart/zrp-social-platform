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
    if (!existing) {
      return NextResponse.json({ isMember: false });
    }

    // Owner leaving simply leaves - no successor-transfer flow in v1.
    // The community keeps working (its feed is hashtag-derived, not
    // owner-gated) with no owner, same known-limitation shape as an
    // admin-less TeamMember account elsewhere in this codebase.
    await prisma.$transaction([
      prisma.communityMember.delete({
        where: { communityId_userId: { communityId: community.id, userId } },
      }),
      prisma.community.update({
        where: { id: community.id },
        data: { memberCount: { decrement: 1 } },
      }),
    ]);

    return NextResponse.json({ isMember: false });
  } catch (error) {
    console.error("Error leaving community:", error);
    return NextResponse.json({ error: "Failed to leave community" }, { status: 500 });
  }
}
