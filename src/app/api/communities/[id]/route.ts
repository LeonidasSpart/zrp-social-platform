import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function findCommunity(idOrSlug: string) {
  return prisma.community.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      category: true,
      hashtag: true,
      iconUrl: true,
      memberCount: true,
      createdAt: true,
      createdBy: { select: { id: true, username: true, name: true, avatarUrl: true } },
    },
  });
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  try {
    const community = await findCommunity(id);
    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const membership = userId
      ? await prisma.communityMember.findUnique({
          where: { communityId_userId: { communityId: community.id, userId } },
          select: { role: true },
        })
      : null;

    return NextResponse.json({
      community,
      isMember: !!membership,
      myRole: membership?.role ?? null,
    });
  } catch (error) {
    console.error("Error fetching community:", error);
    return NextResponse.json({ error: "Failed to fetch community" }, { status: 500 });
  }
}
