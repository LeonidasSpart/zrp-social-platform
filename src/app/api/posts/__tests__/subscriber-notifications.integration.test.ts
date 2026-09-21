import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function createPostReq(body: Record<string, unknown>) {
  return new NextRequest("https://zrp.one/api/posts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/*
 * End-to-end wiring check: POST /api/posts actually triggers the
 * PostSubscription fan-out (src/lib/post-subscriptions.ts) for a
 * subscriber once the post is published - not just a unit test of the
 * fan-out function in isolation. See
 * src/lib/__tests__/post-subscriptions.test.ts for the exhaustive
 * scenario coverage (blocking, dedup, self-notify, bulk, cascade); this
 * file only proves the route actually calls it on the real publish path.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/posts - subscriber notification wiring (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterAll(async () => {
      await prisma.notification.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.postSubscription.deleteMany({
        where: { OR: [{ subscriberId: { in: userIds } }, { authorId: { in: userIds } }] },
      });
      await prisma.post.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@postswiretest.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
        },
      });
      userIds.push(user.id);
      return user;
    }

    it("notifies a subscriber once a new post from the author is published via the real API route", async () => {
      const author = await createUser("wireauthor1");
      const subscriber = await createUser("wiresub1");
      await prisma.postSubscription.create({
        data: { subscriberId: subscriber.id, authorId: author.id },
      });

      getToken.mockResolvedValue({ id: author.id, name: "Wire Author", username: author.username });

      const res = await POST(createPostReq({ content: `hello subscribers ${runId}` }));
      expect(res.status).toBe(201);
      const { post: created } = await res.json();
      postIds.push(created.id);

      // Fan-out is fire-and-forget (not awaited by the route - see
      // CLAUDE.md on why that's safe for this persistent-process
      // deployment), so give the microtask queue a tick to run it before
      // asserting.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const notif = await prisma.notification.findFirst({
        where: {
          userId: subscriber.id,
          fromUserId: author.id,
          postId: created.id,
          type: "post_from_subscription",
        },
      });
      expect(notif).toBeTruthy();
    });
  }
);
