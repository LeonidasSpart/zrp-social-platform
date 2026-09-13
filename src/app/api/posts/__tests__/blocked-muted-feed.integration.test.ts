import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function feedReq() {
  return new NextRequest("https://zrp.one/api/posts?tab=for-you");
}

/*
 * Regression coverage for a real bug found in a forensic re-audit: the
 * blocked-user exclusion and the muted-user exclusion were built as two
 * SEPARATE assignments to `where.authorId`, e.g.
 *   where.authorId = { notIn: excludedUserIds };      // blocked
 *   where.authorId = { ...(where.authorId||{}), notIn: mutedIds }; // muted
 * The second object literal's own `notIn: mutedIds` key silently
 * overwrote the spread-in `notIn` from the first assignment (a later
 * key in the same object literal always wins), so a viewer who had
 * BOTH blocked someone AND muted someone (regardless of who) had the
 * blocked account's posts reappear in their feed - the muted exclusion
 * worked, but it replaced the blocked exclusion instead of combining
 * with it. Fixed by building one combined `excludedUserIds` array
 * up front. This is the same 8-call-site pattern used correctly
 * everywhere else in the codebase (search/route.ts,
 * posts/explore/route.ts, users/[username]/{posts,likes,replies,media}/
 * route.ts all already combine into one array) - this route was the
 * only outlier.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/posts - blocked + muted composition (integration, real Postgres)",
  () => {
    const suffix = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterAll(async () => {
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.blocked.deleteMany({ where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] } });
      await prisma.mute.deleteMany({ where: { muterId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${suffix}@blockedmutedtest.example`,
          username: `${label}${suffix}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createPost(authorId: string, content: string) {
      const post = await prisma.post.create({
        data: { authorId, content, status: "published" },
      });
      postIds.push(post.id);
      return post;
    }

    it("still excludes a blocked user's posts when the viewer has ALSO muted someone else", async () => {
      const viewer = await createUser("viewer");
      const blocked = await createUser("blockeduser");
      const muted = await createUser("muteduser");

      const blockedPost = await createPost(blocked.id, "post from a blocked user - must never appear");
      const mutedPost = await createPost(muted.id, "post from a muted user - must never appear");

      await prisma.blocked.create({ data: { blockerId: viewer.id, blockedId: blocked.id } });
      await prisma.mute.create({ data: { muterId: viewer.id, mutedId: muted.id } });

      getToken.mockResolvedValue({ id: viewer.id });
      const res = await GET(feedReq());
      expect(res.status).toBe(200);
      const body = await res.json();
      const ids = (body.posts ?? body).map((p: { id: string }) => p.id);

      expect(ids).not.toContain(blockedPost.id);
      expect(ids).not.toContain(mutedPost.id);
    });
  }
);
