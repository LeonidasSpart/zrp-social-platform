import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCursorParams } from "@/lib/pagination";
import { getCommunityFeedPage } from "@/lib/communities";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  try {
    const community = await prisma.community.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      select: { hashtag: true },
    });
    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const { cursor, limit } = parseCursorParams(req);
    const { items, nextCursor } = await getCommunityFeedPage(
      community.hashtag,
      userId,
      cursor,
      limit
    );

    return NextResponse.json({ posts: items, nextCursor });
  } catch (error) {
    console.error("Error fetching community feed:", error);
    return NextResponse.json({ error: "Failed to fetch community feed" }, { status: 500 });
  }
}
