import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MAX_IDS = 100;

// ─── GET /api/users/notify-posts?ids=a,b,c: batched "am I subscribed to
// each of these authors' posts" - the same batch-with-a-Set pattern
// GET /api/users/[username]/followers already uses for isFollowing, so
// a feed/search page with many different post authors on screen makes
// ONE request and ONE query instead of one per author card.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idsParam = req.nextUrl.searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const authorIds = Array.from(
    new Set(
      idsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_IDS);

  if (authorIds.length === 0) {
    return NextResponse.json({});
  }

  try {
    const subscriptions = await prisma.postSubscription.findMany({
      where: { subscriberId: session.user.id, authorId: { in: authorIds } },
      select: { authorId: true },
    });
    const subscribedSet = new Set(subscriptions.map((s) => s.authorId));

    const result: Record<string, boolean> = {};
    for (const id of authorIds) {
      result[id] = subscribedSet.has(id);
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Batch post-subscription status error:", error);
    return NextResponse.json({ error: "Failed to check post notification status" }, { status: 500 });
  }
}
