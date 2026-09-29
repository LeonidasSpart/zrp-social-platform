import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getRedisClient } from "@/lib/redis";

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(query: Record<string, string> = {}) {
  const url = new URL("https://zrp.one/api/hashtags/trending");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

// Regression coverage for Task #3 (Discover/Explore parity): this route
// used to run its own inline, unfiltered "scan 1000 posts, tally tags"
// query - a tag that only existed on an unpublished, still-scheduled, or
// banned author's posts still counted toward "trending." It now reuses
// the same shared, already-filtered getAllHashtagCounts() module
// GET /api/hashtags/search already relies on.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/hashtags/trending (integration, real Postgres + Redis)",
  () => {
    const userIds: string[] = [];
    const postIds: string[] = [];
    const runId = randomUUID().slice(0, 8);

    async function createUser(label: string, overrides: { banned?: boolean } = {}) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@trendingtest.example`,
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

    // getAllHashtagCounts() caches its raw scan in Redis for 5 minutes -
    // each test seeds its own posts and expects to see them immediately,
    // so a stale scan left behind by an earlier test must never survive
    // between test cases when Redis is actually present.
    beforeEach(async () => {
      const redis = await getRedisClient();
      if (redis) await redis.flushDb();
    });

    afterAll(async () => {
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("ranks hashtags by descending post count", async () => {
      const author = await createUser("ranked");
      const popular = `zrptrend${runId}a`;
      const rare = `zrptrend${runId}b`;
      await createPost(author.id, [popular]);
      await createPost(author.id, [popular]);
      await createPost(author.id, [rare]);

      const res = await GET(req());
      expect(res.status).toBe(200);
      const body: { tag: string; count: number }[] = await res.json();
      const tags = body.map((h) => h.tag);
      expect(tags.indexOf(popular)).toBeLessThan(tags.indexOf(rare));
      expect(body.find((h) => h.tag === popular)?.count).toBe(2);
      expect(body.find((h) => h.tag === rare)?.count).toBe(1);
    });

    it("clamps limit between 1 and 50, defaulting to 10", async () => {
      const author = await createUser("limits");
      const base = `zrplimit${runId}`;
      for (let i = 0; i < 12; i++) {
        await createPost(author.id, [`${base}${String(i).padStart(2, "0")}`]);
      }

      const defaultRes = await GET(req());
      expect((await defaultRes.json()).length).toBeLessThanOrEqual(10);

      const overRes = await GET(req({ limit: "999" }));
      expect((await overRes.json()).length).toBeLessThanOrEqual(50);

      const underRes = await GET(req({ limit: "0" }));
      expect((await underRes.json()).length).toBeGreaterThanOrEqual(1);
    });

    it("excludes a tag that exists only on unpublished, scheduled, or banned-author posts", async () => {
      const bannedAuthor = await createUser("bannedtrend", { banned: true });
      const normalAuthor = await createUser("normaltrend");

      const draftOnlyTag = `zrptdraft${runId}`;
      const scheduledOnlyTag = `zrptsched${runId}`;
      const bannedOnlyTag = `zrptbanned${runId}`;

      await createPost(normalAuthor.id, [draftOnlyTag], { status: "draft" });
      await createPost(normalAuthor.id, [scheduledOnlyTag], {
        status: "scheduled",
        scheduledAt: new Date(Date.now() + 60_000),
      });
      await createPost(bannedAuthor.id, [bannedOnlyTag]);

      const res = await GET(req({ limit: "50" }));
      const body: { tag: string }[] = await res.json();
      const tags = body.map((h) => h.tag);
      expect(tags).not.toContain(draftOnlyTag);
      expect(tags).not.toContain(scheduledOnlyTag);
      expect(tags).not.toContain(bannedOnlyTag);
    });

    it("a tag from a live, published, non-banned author's post is included", async () => {
      const author = await createUser("livetrend");
      const tag = `zrptlive${runId}`;
      await createPost(author.id, [tag]);

      const res = await GET(req({ limit: "50" }));
      const body: { tag: string }[] = await res.json();
      expect(body.map((h) => h.tag)).toContain(tag);
    });
  }
);
