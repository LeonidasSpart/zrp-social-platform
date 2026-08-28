import { prisma } from "./db";
import { Prisma } from "@prisma/client";

const POST_INCLUDE = {
  post: {
    include: {
      author: {
        select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true },
      },
      _count: {
        select: { likes: true, comments: true, reposts: true, quotedBy: true },
      },
    },
  },
} as const;

const COMMENT_INCLUDE = {
  comment: {
    include: {
      author: { select: { id: true, username: true, name: true, avatarUrl: true } },
      post: {
        select: {
          id: true,
          content: true,
          author: { select: { username: true, name: true } },
        },
      },
    },
  },
} as const;

export interface BookmarkItem {
  type: "post" | "comment";
  id: string;
  createdAt: Date;
  post?: Prisma.BookmarkGetPayload<{ include: typeof POST_INCLUDE }>["post"];
  comment?: Prisma.CommentBookmarkGetPayload<{ include: typeof COMMENT_INCLUDE }>["comment"];
}

interface CursorPosition {
  createdAt: Date;
  id: string;
}

/**
 * Bookmarks are a UNION of two independent tables (post bookmarks and
 * comment bookmarks) merged into one timeline, which is why this can't
 * reuse Prisma's native single-model `cursor` option the way the other
 * paginated endpoints do - there's no single row whose id can serve as
 * a position marker across both tables. The cursor here instead
 * encodes a (createdAt, id) position in that merged timeline.
 */
function encodeCursor(item: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: item.createdAt.toISOString(), id: item.id })).toString(
    "base64url"
  );
}

function decodeCursor(cursor: string): CursorPosition | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    if (typeof parsed.id !== "string" || typeof parsed.createdAt !== "string") return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * Builds the "strictly after this position, in (createdAt DESC, id
 * DESC) order" filter shared by both source tables.
 */
function afterCursorWhere(cursor: CursorPosition | null) {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

function sortKey(item: { createdAt: Date; id: string }): [number, string] {
  return [item.createdAt.getTime(), item.id];
}

function compareDesc(a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number {
  const [aTime, aId] = sortKey(a);
  const [bTime, bId] = sortKey(b);
  if (aTime !== bTime) return bTime - aTime;
  return aId < bId ? 1 : aId > bId ? -1 : 0;
}

export async function getUserBookmarksPage(
  userId: string,
  cursorParam: string | null,
  limit: number
): Promise<{ items: BookmarkItem[]; nextCursor: string | null }> {
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  // An unparseable cursor is treated as "start over" rather than
  // erroring - a bad/stale cursor should never surface as a broken
  // page, just an inconsistent one, which is still better than a 500.
  const after = afterCursorWhere(cursor);

  // Overfetch by one per table: if a table's own after-cursor result
  // set is larger than `limit`, this is how we know there's more data
  // even when the merged page is otherwise exactly `limit` items -
  // see the correctness note in the bookmarks route/tests for why
  // fetching `limit + 1` from EACH table (not `limit` total) is
  // required to guarantee the true next-`limit` global items are
  // always captured.
  const fetchLimit = limit + 1;

  const [postBookmarks, commentBookmarks] = await Promise.all([
    prisma.bookmark.findMany({
      where: { userId, ...after },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: fetchLimit,
      include: POST_INCLUDE,
    }),
    prisma.commentBookmark.findMany({
      where: { userId, ...after },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: fetchLimit,
      include: COMMENT_INCLUDE,
    }),
  ]);

  const merged: BookmarkItem[] = [
    ...postBookmarks.map((b) => ({
      type: "post" as const,
      id: b.id,
      createdAt: b.createdAt,
      post: b.post,
    })),
    ...commentBookmarks.map((b) => ({
      type: "comment" as const,
      id: b.id,
      createdAt: b.createdAt,
      comment: b.comment,
    })),
  ].sort(compareDesc);

  const hasMore = merged.length > limit;
  const items = merged.slice(0, limit);
  const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null;

  return { items, nextCursor };
}
