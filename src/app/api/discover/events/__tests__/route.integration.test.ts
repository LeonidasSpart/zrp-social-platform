import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(body: unknown, ip = "203.0.113.60") {
  return new NextRequest("https://zrp.one/api/discover/events", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/discover/events (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@discoverevents.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createVideoPost(authorId: string, overrides: { status?: string } = {}) {
      const post = await prisma.post.create({
        data: {
          id: randomUUID(),
          content: `discover event target ${runId}`,
          authorId,
          status: overrides.status ?? "published",
          mediaType: "video",
          imageUrl: `https://utfs.io/f/${randomUUID()}.mp4`,
        },
      });
      postIds.push(post.id);
      return post;
    }

    afterAll(async () => {
      await prisma.discoverEvent.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("17. records a valid IMPRESSION event for an authenticated viewer", async () => {
      const author = await createUser("author17");
      const viewer = await createUser("viewer17");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue({ id: viewer.id });

      const res = await POST(req({ postId: post.id, eventType: "IMPRESSION" }));
      expect(res.status).toBe(200);
      expect((await res.json()).recorded).toBe(true);

      const row = await prisma.discoverEvent.findFirst({ where: { postId: post.id, userId: viewer.id } });
      expect(row).toBeTruthy();
      expect(row?.eventType).toBe("IMPRESSION");
    });

    it("17b. records events for an anonymous viewer (userId null)", async () => {
      const author = await createUser("author17b");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue(null);

      const res = await POST(req({ postId: post.id, eventType: "START" }));
      expect(res.status).toBe(200);
      expect((await res.json()).recorded).toBe(true);

      const row = await prisma.discoverEvent.findFirst({ where: { postId: post.id, eventType: "START" } });
      expect(row?.userId).toBeNull();
    });

    it("18. rejects a missing postId or an invalid eventType with 400, and never writes a row", async () => {
      const author = await createUser("author18");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue(null);

      const missingPost = await POST(req({ eventType: "IMPRESSION" }));
      expect(missingPost.status).toBe(400);

      const badType = await POST(req({ postId: post.id, eventType: "LIKE_BURST_9000" }));
      expect(badType.status).toBe(400);

      const count = await prisma.discoverEvent.count({ where: { postId: post.id } });
      expect(count).toBe(0);
    });

    it("does not record an event for a post that is not published, not video, or does not exist (and this is not an error)", async () => {
      const author = await createUser("author18b");
      const draft = await createVideoPost(author.id, { status: "draft" });
      getToken.mockResolvedValue(null);

      const draftRes = await POST(req({ postId: draft.id, eventType: "IMPRESSION" }));
      expect(draftRes.status).toBe(200);
      expect((await draftRes.json()).recorded).toBe(false);

      const missingRes = await POST(req({ postId: "does-not-exist-anywhere", eventType: "IMPRESSION" }));
      expect(missingRes.status).toBe(200);
      expect((await missingRes.json()).recorded).toBe(false);
    });

    it("19. dedupes a repeated IMPRESSION for the same (post, viewer) within the dedup window", async () => {
      const author = await createUser("author19");
      const viewer = await createUser("viewer19");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue({ id: viewer.id });

      const first = await POST(req({ postId: post.id, eventType: "IMPRESSION" }));
      expect((await first.json()).recorded).toBe(true);

      const second = await POST(req({ postId: post.id, eventType: "IMPRESSION" }));
      expect((await second.json()).recorded).toBe(false);

      const count = await prisma.discoverEvent.count({
        where: { postId: post.id, userId: viewer.id, eventType: "IMPRESSION" },
      });
      expect(count).toBe(1);
    });

    it("19c. dedupes a repeated IMPRESSION from an ANONYMOUS caller by IP - the fix for the documented-vs-actual mismatch", async () => {
      const author = await createUser("author19c");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue(null);
      const ip = "198.51.100.19";

      const first = await POST(req({ postId: post.id, eventType: "IMPRESSION" }, ip));
      expect((await first.json()).recorded).toBe(true);

      // Before the fix, this endpoint only deduped by userId, so an
      // anonymous caller (userId always null) could spam unlimited
      // IMPRESSION rows for the same post from the same IP with zero
      // dedup - this is the exact abuse this test proves is now closed.
      const second = await POST(req({ postId: post.id, eventType: "IMPRESSION" }, ip));
      expect((await second.json()).recorded).toBe(false);

      const third = await POST(req({ postId: post.id, eventType: "IMPRESSION" }, ip));
      expect((await third.json()).recorded).toBe(false);

      const count = await prisma.discoverEvent.count({
        where: { postId: post.id, userId: null, eventType: "IMPRESSION" },
      });
      expect(count).toBe(1);
    });

    it("19d. does NOT dedupe two different anonymous callers (different IPs) hitting the same post", async () => {
      const author = await createUser("author19d");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue(null);

      const first = await POST(req({ postId: post.id, eventType: "START" }, "198.51.100.20"));
      expect((await first.json()).recorded).toBe(true);

      const second = await POST(req({ postId: post.id, eventType: "START" }, "198.51.100.21"));
      expect((await second.json()).recorded).toBe(true);

      const count = await prisma.discoverEvent.count({
        where: { postId: post.id, userId: null, eventType: "START" },
      });
      expect(count).toBe(2);
    });

    it("19e. an authenticated viewer's dedup is unaffected by IP changes (still keyed by userId, not ip)", async () => {
      const author = await createUser("author19e");
      const viewer = await createUser("viewer19e");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue({ id: viewer.id });

      const first = await POST(req({ postId: post.id, eventType: "IMPRESSION" }, "198.51.100.22"));
      expect((await first.json()).recorded).toBe(true);

      // Same signed-in viewer, different IP (e.g. switched networks
      // mid-scroll) - still deduped, because authenticated dedup keys
      // on the verified userId, never on ip.
      const second = await POST(req({ postId: post.id, eventType: "IMPRESSION" }, "198.51.100.23"));
      expect((await second.json()).recorded).toBe(false);

      const count = await prisma.discoverEvent.count({
        where: { postId: post.id, userId: viewer.id, eventType: "IMPRESSION" },
      });
      expect(count).toBe(1);
    });

    it("19f. never persists ip alongside a known userId (ip is null on every authenticated row)", async () => {
      const author = await createUser("author19f");
      const viewer = await createUser("viewer19f");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue({ id: viewer.id });

      await POST(req({ postId: post.id, eventType: "IMPRESSION" }, "198.51.100.24"));

      const row = await prisma.discoverEvent.findFirst({ where: { postId: post.id, userId: viewer.id } });
      expect(row?.ip).toBeNull();
    });

    it("20b. never attributes an event to a client-supplied userId/viewerId - attribution always comes from the verified session", async () => {
      const author = await createUser("author20b");
      const realViewer = await createUser("realviewer20b");
      const impersonated = await createUser("impersonated20b");
      const post = await createVideoPost(author.id);
      // The verified session belongs to realViewer - the route must
      // never trust anything the client puts in the body instead.
      getToken.mockResolvedValue({ id: realViewer.id });

      const res = await POST(
        req({
          postId: post.id,
          eventType: "IMPRESSION",
          // An attacker-controlled body trying to spoof attribution.
          userId: impersonated.id,
          viewerId: impersonated.id,
        })
      );
      expect(res.status).toBe(200);
      expect((await res.json()).recorded).toBe(true);

      const row = await prisma.discoverEvent.findFirst({ where: { postId: post.id } });
      expect(row?.userId).toBe(realViewer.id);
      expect(row?.userId).not.toBe(impersonated.id);
    });

    it("COMPLETE events are not deduped the way IMPRESSION/START are (one per real watch, not spam-prone the same way)", async () => {
      const author = await createUser("author19b");
      const viewer = await createUser("viewer19b");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue({ id: viewer.id });

      await POST(req({ postId: post.id, eventType: "COMPLETE" }));
      await POST(req({ postId: post.id, eventType: "COMPLETE" }));

      const count = await prisma.discoverEvent.count({
        where: { postId: post.id, userId: viewer.id, eventType: "COMPLETE" },
      });
      expect(count).toBe(2);
    });

    it("stores a plausible watchedMs and clamps an implausible one rather than rejecting the whole event", async () => {
      const author = await createUser("author-watchedms");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue(null);

      const res = await POST(req({ postId: post.id, eventType: "COMPLETE", watchedMs: 999_999_999 }));
      expect(res.status).toBe(200);
      const row = await prisma.discoverEvent.findFirst({
        where: { postId: post.id, eventType: "COMPLETE" },
        orderBy: { createdAt: "desc" },
      });
      expect(row?.watchedMs).toBeLessThanOrEqual(30 * 60 * 1000);
    });
  }
);
