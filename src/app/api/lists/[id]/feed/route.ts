import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCursorParams } from "@/lib/pagination";
import { getListFeedPage } from "@/lib/lists";
import { applyPremiumGating, withAuthorId, withoutAuthorId } from "@/lib/premium-content";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  try {
    const list = await prisma.list.findUnique({
      where: { id },
      select: {
        ownerId: true,
        isPrivate: true,
        members: { select: { userId: true } },
      },
    });
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }
    if (list.isPrivate && list.ownerId !== userId) {
      return NextResponse.json({ error: "This list is private" }, { status: 403 });
    }

    const { cursor, limit } = parseCursorParams(req);
    const memberIds = list.members.map((m) => m.userId);
    const { items, nextCursor } = await getListFeedPage(memberIds, userId, cursor, limit);

    // ⚠️ SECURITY (N5): list feeds read Post rows directly and returned
    // them unredacted - a premium-gated post from a listed member
    // leaked its full content/media regardless of purchase status. See
    // src/lib/premium-content.ts.
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
    console.error("Error fetching list feed:", error);
    return NextResponse.json({ error: "Failed to fetch list feed" }, { status: 500 });
  }
}
