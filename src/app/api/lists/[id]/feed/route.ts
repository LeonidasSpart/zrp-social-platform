import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseCursorParams } from "@/lib/pagination";
import { getListFeedPage } from "@/lib/lists";

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

    return NextResponse.json({ posts: items, nextCursor });
  } catch (error) {
    console.error("Error fetching list feed:", error);
    return NextResponse.json({ error: "Failed to fetch list feed" }, { status: 500 });
  }
}
