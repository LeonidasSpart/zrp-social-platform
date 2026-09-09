import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin }));

import { prisma } from "@/lib/db";
import { GET } from "../route";

// Real bug this locks in against regressing (see route.ts's own
// comment): the old raw SQL unioned all 5 tables into one bare `id`
// column with no source tag, then ran the identical
// COUNT(DISTINCT CASE WHEN ...) expression for every output column -
// so users/posts/comments/likes/reposts were mathematically
// guaranteed to be equal every single day, not real per-type counts.
// Separately, Postgres COUNT() returns bigint, which JSON.stringify
// (inside NextResponse.json) cannot serialize - crashing this route
// with a plain 500 any time there was real activity in the last 30
// days, which is every real production day.
const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)("GET /api/admin/analytics (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  let userId: string;

  beforeAll(async () => {
    requireAdmin.mockResolvedValue({ authorized: true, session: { user: { id: "admin-1", role: "ADMIN" } } });

    const user = await prisma.user.create({
      data: {
        email: `analytics-test-${suffix}@example.com`,
        username: `analytics_test_${suffix}`,
        password: "not-a-real-hash",
      },
    });
    userId = user.id;

    const postA = await prisma.post.create({
      data: { content: "analytics test post A", authorId: userId },
    });
    const postB = await prisma.post.create({
      data: { content: "analytics test post B", authorId: userId },
    });

    // 1 comment, 2 likes, 1 repost - deliberately all different counts
    // from each other and from the 1 user / 2 posts above, so a
    // regression back to "every column equals the same total" would
    // fail this test even if the route stopped crashing.
    await prisma.comment.create({
      data: { content: "analytics test comment", postId: postA.id, authorId: userId },
    });
    await prisma.like.create({ data: { postId: postA.id, userId } });
    await prisma.like.create({ data: { postId: postB.id, userId } });
    await prisma.repost.create({ data: { postId: postA.id, userId } });
  });

  afterAll(async () => {
    // Post.author, Comment.post/author, Like.post/user, Repost.post/user
    // are all onDelete: Cascade back to User in schema.prisma, so
    // deleting the one test user cleans up everything created above.
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("returns 200 (not a BigInt-serialization 500) and independent per-type daily counts", async () => {
    const res = await GET(new NextRequest("https://zrp.one/api/admin/analytics"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.error).toBeUndefined();
    expect(body.summary.users).toBeGreaterThanOrEqual(1);
    expect(body.summary.posts).toBeGreaterThanOrEqual(2);

    const today = new Date().toISOString().slice(0, 10);
    const todayRow = (body.daily as Array<{ date: string; users: number; posts: number; comments: number; likes: number; reposts: number }>).find(
      (row) => new Date(row.date).toISOString().slice(0, 10) === today,
    );
    expect(todayRow).toBeDefined();

    // The real regression check: these must NOT all be equal (the old
    // query made that mathematically impossible to avoid).
    expect(todayRow!.posts).toBeGreaterThanOrEqual(2);
    expect(todayRow!.comments).toBeGreaterThanOrEqual(1);
    expect(todayRow!.likes).toBeGreaterThanOrEqual(2);
    expect(todayRow!.reposts).toBeGreaterThanOrEqual(1);
    expect(todayRow!.likes).not.toBe(todayRow!.reposts);
    expect(todayRow!.posts).not.toBe(todayRow!.comments);

    // Every count is a plain JS number (proves the ::int cast worked -
    // a lingering BigInt would already have thrown inside
    // NextResponse.json before this test could even see a response).
    for (const row of body.daily) {
      expect(typeof row.users).toBe("number");
      expect(typeof row.posts).toBe("number");
      expect(typeof row.comments).toBe("number");
      expect(typeof row.likes).toBe("number");
      expect(typeof row.reposts).toBe("number");
    }
  });

  it("401s when the caller isn't an admin", async () => {
    requireAdmin.mockResolvedValueOnce({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await GET(new NextRequest("https://zrp.one/api/admin/analytics"));
    expect(res.status).toBe(401);
  });
});
