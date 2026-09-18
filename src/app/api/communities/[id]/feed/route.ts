import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCursorParams } from "@/lib/pagination";
import { getCommunityFeedPage } from "@/lib/communities";
import { applyPremiumGating, withAuthorId, withoutAuthorId } from "@/lib/premium-content";

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

    // ⚠️ SECURITY (N5): community feeds read Post rows directly and
    // returned them unredacted - a premium-gated post appearing in a
    // hashtag community's feed leaked its full content/media regardless
    // of purchase status. See src/lib/premium-content.ts.
    //
    // POST_CARD_SELECT (src/lib/post-card-feed.ts) doesn't select a raw
    // `authorId` scalar on either the post or its nested quotePost, only
    // the nested `author.id` relation - mapped in and back out here
    // rather than widening that shared select, which several other
    // feeds rely on matching field-for-field.
    const gated = await applyPremiumGating(
      items.map((post) => withAuthorId(post)),
      userId
    );
    const gatedItems = gated.map((post) => withoutAuthorId(post));

    return NextResponse.json({ posts: gatedItems, nextCursor });
  } catch (error) {
    console.error("Error fetching community feed:", error);
    return NextResponse.json({ error: "Failed to fetch community feed" }, { status: 500 });
  }
}
