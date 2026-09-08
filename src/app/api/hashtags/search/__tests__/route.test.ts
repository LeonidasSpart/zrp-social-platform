import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(query: Record<string, string> = {}) {
  const url = new URL("https://zrp.one/api/hashtags/search");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

// Regression coverage for Phase 5: real hashtag search (as opposed to the
// pre-existing exact-match-only path inside /api/search?type=posts, and
// /api/hashtags/trending's top-50-only aggregate) - prefix matching
// against every distinct real hashtag, ranked by usage, respecting
// moderation (published/non-scheduled/non-banned-author content only).
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/hashtags/search (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const postIds: string[] = [];
    const runId = randomUUID().slice(0, 8);

    async function createUser(label: string, overrides: { banned?: boolean } = {}) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@hashtagtest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
          banned: overrides.banned ?? false,
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(
      authorId: string,
      hashtags: string[],
      overrides: { status?: string; scheduledAt?: Date | null } = {}
    ) {
      const post = await prisma.post.create({
        data: {
          id: randomUUID(),
          content: `post about ${hashtags.join(" ")}`,
          authorId,
          hashtags,
          status: overrides.status ?? "published",
          scheduledAt: overrides.scheduledAt ?? null,
        },
      });
      postIds.push(post.id);
      return post;
    }

    // The route caches its full hashtag aggregate in Redis for 5 minutes
    // (see route.ts's CACHE_KEY). Each test seeds its own posts and
    // expects to see them immediately, so a stale aggregate left behind
    // by an earlier test - invisible whenever Redis happens to be
    // absent, since getCached() then always misses - must never survive
    // between test cases when Redis actually is present (e.g. running
    // locally alongside a real redis-server).
    beforeEach(async () => {
      const redis = await getRedisClient();
      if (redis) await redis.flushDb();
    });

    afterAll(async () => {
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("returns an empty result for a blank query rather than dumping every hashtag", async () => {
      const res = await GET(req());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ items: [], nextCursor: null });
    });

    it(`prefix-matches a real hashtag distinct to this test (zrptest${runId})`, async () => {
      const author = await createUser("prefix");
      const tag = `zrptest${runId}`;
      await createPost(author.id, [tag]);

      const res = await GET(req({ q: tag.slice(0, 5) }));
      const body = await res.json();
      expect(body.items.map((h: { tag: string }) => h.tag)).toContain(tag);
    });

    it("accepts a leading # and is case-insensitive", async () => {
      const author = await createUser("hashcase");
      const tag = `zrpcase${runId}`;
      await createPost(author.id, [tag]);

      const res = await GET(req({ q: `#${tag.slice(0, 4).toUpperCase()}` }));
      const body = await res.json();
      expect(body.items.map((h: { tag: string }) => h.tag)).toContain(tag);
    });

    it("ranks matches by descending post count", async () => {
      const author = await createUser("ranked");
      const popular = `zrprank${runId}a`;
      const rare = `zrprank${runId}b`;
      await createPost(author.id, [popular]);
      await createPost(author.id, [popular]);
      await createPost(author.id, [popular]);
      await createPost(author.id, [rare]);

      const res = await GET(req({ q: `zrprank${runId}` }));
      const body = await res.json();
      const tags = body.items.map((h: { tag: string }) => h.tag);
      expect(tags.indexOf(popular)).toBeLessThan(tags.indexOf(rare));
      expect(body.items.find((h: { tag: string }) => h.tag === popular).count).toBe(3);
      expect(body.items.find((h: { tag: string }) => h.tag === rare).count).toBe(1);
    });

    it("excludes hashtags that exist only on unpublished, scheduled, or banned-author posts", async () => {
      const bannedAuthor = await createUser("banned", { banned: true });
      const normalAuthor = await createUser("normal");

      const draftOnlyTag = `zrpdraft${runId}`;
      const scheduledOnlyTag = `zrpsched${runId}`;
      const bannedOnlyTag = `zrpbanned${runId}`;

      await createPost(normalAuthor.id, [draftOnlyTag], { status: "draft" });
      await createPost(normalAuthor.id, [scheduledOnlyTag], {
        status: "scheduled",
        scheduledAt: new Date(Date.now() + 60_000),
      });
      await createPost(bannedAuthor.id, [bannedOnlyTag]);

      const [draftRes, scheduledRes, bannedRes] = await Promise.all([
        GET(req({ q: draftOnlyTag })),
        GET(req({ q: scheduledOnlyTag })),
        GET(req({ q: bannedOnlyTag })),
      ]);

      expect((await draftRes.json()).items).toEqual([]);
      expect((await scheduledRes.json()).items).toEqual([]);
      expect((await bannedRes.json()).items).toEqual([]);
    });

    it("paginates results with a numeric offset cursor, visiting every match exactly once", async () => {
      const author = await createUser("paginate");
      const base = `zrppage${runId}`;
      const tags = Array.from({ length: 12 }, (_, i) => `${base}${String(i).padStart(2, "0")}`);
      for (const tag of tags) {
        await createPost(author.id, [tag]);
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let guard = 0;
      do {
        const res: Response = await GET(req({ q: base, limit: "5", ...(cursor ? { cursor } : {}) }));
        const body: { items: { tag: string }[]; nextCursor: string | null } = await res.json();
        expect(body.items.length).toBeLessThanOrEqual(5);
        seen.push(...body.items.map((h) => h.tag));
        cursor = body.nextCursor;
        guard++;
        expect(guard).toBeLessThan(20);
      } while (cursor !== null);

      expect(new Set(seen).size).toBe(tags.length);
      for (const tag of tags) expect(seen).toContain(tag);
    });
  }
);
