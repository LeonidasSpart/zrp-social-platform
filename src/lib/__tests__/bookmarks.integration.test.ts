import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { getUserBookmarksPage } from "../bookmarks";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)(
  "getUserBookmarksPage (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];
    const commentIds: string[] = [];
    const bookmarkIds: string[] = [];
    const commentBookmarkIds: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@bmtest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    let viewer: { id: string };
    let author: { id: string };

    // Ground truth key: `${type}:${id}` -> { createdAt, id, type }
    const expectedItems: { type: "post" | "comment"; id: string; createdAt: Date }[] = [];

    beforeAll(async () => {
      viewer = await createUser("viewer");
      author = await createUser("author");

      const base = new Date("2021-01-01T00:00:00Z").getTime();
      let clock = base;
      const nextTime = () => new Date((clock += 1000));

      // ── 40 post bookmarks ──────────────────────────────────────────
      for (let i = 0; i < 40; i++) {
        const post = await prisma.post.create({
          data: { id: randomUUID(), content: `post ${i}`, authorId: author.id, status: "published" },
        });
        postIds.push(post.id);

        const t = nextTime();
        const bookmark = await prisma.bookmark.create({
          data: { id: randomUUID(), userId: viewer.id, postId: post.id, createdAt: t },
        });
        bookmarkIds.push(bookmark.id);
        expectedItems.push({ type: "post", id: bookmark.id, createdAt: t });
      }

      // ── 30 comment bookmarks ───────────────────────────────────────
      for (let i = 0; i < 30; i++) {
        const post = await prisma.post.create({
          data: { id: randomUUID(), content: `host post ${i}`, authorId: author.id, status: "published" },
        });
        postIds.push(post.id);
        const comment = await prisma.comment.create({
          data: { id: randomUUID(), content: `comment ${i}`, authorId: author.id, postId: post.id },
        });
        commentIds.push(comment.id);

        const t = nextTime();
        const commentBookmark = await prisma.commentBookmark.create({
          data: { id: randomUUID(), userId: viewer.id, commentId: comment.id, createdAt: t },
        });
        commentBookmarkIds.push(commentBookmark.id);
        expectedItems.push({ type: "comment", id: commentBookmark.id, createdAt: t });
      }

      // ── Deliberate cross-type timestamp tie: a post bookmark and a
      // comment bookmark at the EXACT same createdAt - the tiebreak
      // (id desc) must keep both distinguishable and neither duplicated
      // nor dropped ────────────────────────────────────────────────────
      {
        const tiePost = await prisma.post.create({
          data: { id: randomUUID(), content: "tie post", authorId: author.id, status: "published" },
        });
        postIds.push(tiePost.id);
        const tieComment = await prisma.comment.create({
          data: { id: randomUUID(), content: "tie comment", authorId: author.id, postId: tiePost.id },
        });
        commentIds.push(tieComment.id);

        const t = nextTime();
        const pb = await prisma.bookmark.create({
          data: { id: randomUUID(), userId: viewer.id, postId: tiePost.id, createdAt: t },
        });
        const cb = await prisma.commentBookmark.create({
          data: { id: randomUUID(), userId: viewer.id, commentId: tieComment.id, createdAt: t },
        });
        bookmarkIds.push(pb.id);
        commentBookmarkIds.push(cb.id);
        expectedItems.push({ type: "post", id: pb.id, createdAt: t });
        expectedItems.push({ type: "comment", id: cb.id, createdAt: t });
      }

      // ── Tail concentrated entirely in one table (10 more post
      // bookmarks, oldest of all) - exercises the "one table alone has
      // more than `limit`" branch of the has-more logic when paginating
      // with a small page size ────────────────────────────────────────
      for (let i = 0; i < 10; i++) {
        const post = await prisma.post.create({
          data: { id: randomUUID(), content: `tail post ${i}`, authorId: author.id, status: "published" },
        });
        postIds.push(post.id);
        const t = nextTime();
        const bookmark = await prisma.bookmark.create({
          data: { id: randomUUID(), userId: viewer.id, postId: post.id, createdAt: t },
        });
        bookmarkIds.push(bookmark.id);
        expectedItems.push({ type: "post", id: bookmark.id, createdAt: t });
      }
    }, 60_000);

    afterAll(async () => {
      await prisma.commentBookmark.deleteMany({ where: { id: { in: commentBookmarkIds } } });
      await prisma.bookmark.deleteMany({ where: { id: { in: bookmarkIds } } });
      await prisma.comment.deleteMany({ where: { id: { in: commentIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    function expectedSortedKeys() {
      return [...expectedItems]
        .sort((a, b) => {
          const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
          if (timeDiff !== 0) return timeDiff;
          return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
        })
        .map((e) => `${e.type}:${e.id}`);
    }

    it("a single unpaginated-limit page contains everything, matching the true count", async () => {
      const { items, nextCursor } = await getUserBookmarksPage(viewer.id, null, 1000);
      expect(items.length).toBe(expectedItems.length);
      expect(nextCursor).toBeNull();
    });

    it("paginates through with a small page size, visiting every item exactly once in order, none dropped", async () => {
      const pageSize = 7; // deliberately doesn't divide the totals evenly
      const seenKeys: string[] = [];
      let cursor: string | null = null;
      let guard = 0;

      do {
        const { items, nextCursor }: Awaited<ReturnType<typeof getUserBookmarksPage>> =
          await getUserBookmarksPage(viewer.id, cursor, pageSize);
        expect(items.length).toBeLessThanOrEqual(pageSize);
        items.forEach((it) => seenKeys.push(`${it.type}:${it.id}`));
        cursor = nextCursor;
        guard++;
        expect(guard).toBeLessThan(200); // safety valve against an infinite loop bug
      } while (cursor !== null);

      expect(new Set(seenKeys).size).toBe(seenKeys.length); // no duplicates across pages
      expect(seenKeys).toEqual(expectedSortedKeys()); // matches ground truth, in order
    });

    it("paginates correctly with a page size that lands exactly on the cross-type timestamp tie", async () => {
      // Walk with pageSize=1 through just enough pages to reach the tie
      // and confirm both tied items appear, each exactly once.
      const pageSize = 1;
      const seenKeys = new Set<string>();
      let cursor: string | null = null;
      let guard = 0;

      do {
        const { items, nextCursor }: Awaited<ReturnType<typeof getUserBookmarksPage>> =
          await getUserBookmarksPage(viewer.id, cursor, pageSize);
        items.forEach((it) => seenKeys.add(`${it.type}:${it.id}`));
        cursor = nextCursor;
        guard++;
        expect(guard).toBeLessThan(200);
      } while (cursor !== null);

      expect(seenKeys.size).toBe(expectedItems.length);
      for (const key of expectedSortedKeys()) {
        expect(seenKeys.has(key)).toBe(true);
      }
    });

    it("correctly detects more data when it's concentrated in a single table beyond the page size", async () => {
      // The last 10 seeded items are all post bookmarks (the "tail").
      // Paginate with a page size smaller than that tail using the
      // real function, and confirm we still reach the very end without
      // stopping early.
      const pageSize = 3;
      let cursor: string | null = null;
      let total = 0;
      let guard = 0;

      do {
        const { items, nextCursor }: Awaited<ReturnType<typeof getUserBookmarksPage>> =
          await getUserBookmarksPage(viewer.id, cursor, pageSize);
        total += items.length;
        cursor = nextCursor;
        guard++;
        expect(guard).toBeLessThan(200);
      } while (cursor !== null);

      expect(total).toBe(expectedItems.length);
    });

    it("returns an empty page with a null cursor for a user with no bookmarks", async () => {
      const lonely = await createUser("lonelybm");
      const { items, nextCursor } = await getUserBookmarksPage(lonely.id, null, 20);
      expect(items).toEqual([]);
      expect(nextCursor).toBeNull();
    });

    it("includes post and comment payloads with the expected shape", async () => {
      const { items } = await getUserBookmarksPage(viewer.id, null, 5);
      for (const item of items) {
        if (item.type === "post") {
          expect(item.post).toBeDefined();
          expect(item.post!.author).toBeDefined();
        } else {
          expect(item.comment).toBeDefined();
          expect(item.comment!.author).toBeDefined();
          expect(item.comment!.post).toBeDefined();
        }
      }
    });
  }
);
