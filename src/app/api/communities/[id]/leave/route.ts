import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OWNER_CANNOT_LEAVE_MESSAGE } from "@/lib/communities";

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

    // The OWNER cannot leave: there is no ownership-transfer flow, and
    // an owner-less community would have nobody able to delete it (the
    // only management action that exists). The rule every client
    // communicates is "delete the community instead" - see
    // DELETE /api/communities/[id]. Returning 409 (not silently
    // succeeding) keeps memberCount and the owner's role truthful.
    if (existing.role === "OWNER") {
      return NextResponse.json(
        { error: OWNER_CANNOT_LEAVE_MESSAGE, code: "OWNER_CANNOT_LEAVE", isMember: true, myRole: "OWNER" },
        { status: 409 }
      );
    }

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
