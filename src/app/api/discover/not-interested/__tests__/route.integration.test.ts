import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { POST } from "../route";
import { fetchCandidatePool } from "@/lib/discover/candidates";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(body: unknown, ip = "203.0.113.70") {
  return new NextRequest("https://zrp.one/api/discover/not-interested", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/discover/not-interested (integration, real Postgres)",
  () => {
    const runId = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const postIds: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${runId}@discovernotint.example`,
          username: `${label}${runId}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createVideoPost(authorId: string) {
      const post = await prisma.post.create({
        data: {
          id: randomUUID(),
          content: `discover not-interested target ${runId}`,
          authorId,
          status: "published",
          mediaType: "video",
          imageUrl: `https://utfs.io/f/${randomUUID()}.mp4`,
        },
      });
      postIds.push(post.id);
      return post;
    }

    afterAll(async () => {
      await prisma.discoverDismissal.deleteMany({ where: { postId: { in: postIds } } });
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("requires a signed-in viewer - an anonymous caller gets 401 and no row is written", async () => {
      const author = await createUser("author21");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue(null);

      const res = await POST(req({ postId: post.id }));
      expect(res.status).toBe(401);

      const count = await prisma.discoverDismissal.count({ where: { postId: post.id } });
      expect(count).toBe(0);
    });

    it("records a dismissal for the real, server-verified viewer - never a client-supplied userId", async () => {
      const author = await createUser("author22");
      const viewer = await createUser("viewer22");
      const attacker = await createUser("attacker22");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue({ id: viewer.id });

      // A spoofed userId/viewerId in the body must never be used - the
      // route reads identity only from the verified session token.
      const res = await POST(req({ postId: post.id, userId: attacker.id, viewerId: attacker.id }));
      expect(res.status).toBe(200);
      expect((await res.json()).dismissed).toBe(true);

      const row = await prisma.discoverDismissal.findUnique({
        where: { userId_postId: { userId: viewer.id, postId: post.id } },
      });
      expect(row).toBeTruthy();

      const attackerRow = await prisma.discoverDismissal.findUnique({
        where: { userId_postId: { userId: attacker.id, postId: post.id } },
      });
      expect(attackerRow).toBeNull();
    });

    it("is idempotent - dismissing the same post twice never errors or creates a duplicate row", async () => {
      const author = await createUser("author23");
      const viewer = await createUser("viewer23");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue({ id: viewer.id });

      const first = await POST(req({ postId: post.id }));
      expect(first.status).toBe(200);
      const second = await POST(req({ postId: post.id }));
      expect(second.status).toBe(200);

      const count = await prisma.discoverDismissal.count({
        where: { userId: viewer.id, postId: post.id },
      });
      expect(count).toBe(1);
    });

    it("400s for a missing postId and 404s for a post that doesn't exist - neither writes a row", async () => {
      const viewer = await createUser("viewer24");
      getToken.mockResolvedValue({ id: viewer.id });

      const missing = await POST(req({}));
      expect(missing.status).toBe(400);

      const notFound = await POST(req({ postId: "does-not-exist-anywhere" }));
      expect(notFound.status).toBe(404);

      const count = await prisma.discoverDismissal.count({ where: { userId: viewer.id } });
      expect(count).toBe(0);
    });

    it("excludes a dismissed post from that viewer's future candidate pool, without affecting other viewers", async () => {
      const author = await createUser("author25");
      const viewer = await createUser("viewer25");
      const otherViewer = await createUser("otherviewer25");
      const post = await createVideoPost(author.id);
      getToken.mockResolvedValue({ id: viewer.id });

      const before = await fetchCandidatePool(viewer.id);
      expect(before.some((p) => p.id === post.id)).toBe(true);

      const res = await POST(req({ postId: post.id }));
      expect(res.status).toBe(200);

      const after = await fetchCandidatePool(viewer.id);
      expect(after.some((p) => p.id === post.id)).toBe(false);

      const otherViewerPool = await fetchCandidatePool(otherViewer.id);
      expect(otherViewerPool.some((p) => p.id === post.id)).toBe(true);
    });
  }
);
