import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { PUT, DELETE } from "../route";
import { GET as listStories } from "../../route";
import { POST as viewStory } from "../view/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function putReq(id: string, body: unknown) {
  return new NextRequest(`https://zrp.one/api/stories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(id: string) {
  return new NextRequest(`https://zrp.one/api/stories/${id}`, { method: "DELETE" });
}

function viewReq(id: string) {
  return new NextRequest(`https://zrp.one/api/stories/${id}/view`, { method: "POST" });
}

// Regression coverage for the reported bug: "I posted a story without
// realizing that my words were incomplete... I couldn't find any option
// to edit or delete a story once it's posted." PUT/DELETE /api/stories/
// {id} didn't exist at all before this. Every check here goes through
// the real route handlers against a real Postgres row, not a mock - the
// mission's own requirement is "verify the actual backend behavior,
// authorization, database references", not just that a button exists.
describe.skipIf(!hasRealDatabaseUrl)("PUT/DELETE /api/stories/[id] (integration, real Postgres)", () => {
  const userIds: string[] = [];

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `story-owner-${randomUUID().slice(0, 8)}@ownertest.example`,
        username: `so${randomUUID().slice(0, 8)}`,
        password: "$2a$10$storyownertestplaceholder0000000000000000000000000",
        role: "USER",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createStory(userId: string, data: { content?: string | null; mediaUrl?: string | null; mediaType?: string | null } = {}) {
    return prisma.story.create({
      data: {
        userId,
        content: data.content ?? "Original story text",
        mediaUrl: data.mediaUrl ?? null,
        mediaType: data.mediaType ?? null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  afterAll(async () => {
    await prisma.storyLike.deleteMany({ where: { story: { userId: { in: userIds } } } });
    await prisma.storyView.deleteMany({ where: { story: { userId: { in: userIds } } } });
    await prisma.story.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  describe("DELETE", () => {
    it("rejects an unauthenticated request", async () => {
      getServerSession.mockResolvedValueOnce(null);
      const owner = await createUser();
      const story = await createStory(owner.id);
      const res = await DELETE(deleteReq(story.id), { params: Promise.resolve({ id: story.id }) });
      expect(res.status).toBe(401);
      expect(await prisma.story.findUnique({ where: { id: story.id } })).not.toBeNull();
    });

    it("404s for a story that doesn't exist", async () => {
      const owner = await createUser();
      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      const res = await DELETE(deleteReq("nonexistent-story-id"), {
        params: Promise.resolve({ id: "nonexistent-story-id" }),
      });
      expect(res.status).toBe(404);
    });

    it("rejects deletion by a user who does not own the story", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const story = await createStory(owner.id);

      getServerSession.mockResolvedValueOnce({ user: { id: attacker.id } });
      const res = await DELETE(deleteReq(story.id), { params: Promise.resolve({ id: story.id }) });
      expect(res.status).toBe(403);

      // The story must still be there - an unauthorized request never
      // touches the database row.
      expect(await prisma.story.findUnique({ where: { id: story.id } })).not.toBeNull();
    });

    it("lets the owner delete their own story, cleaning up views/likes", async () => {
      const owner = await createUser();
      const viewer = await createUser();
      const story = await createStory(owner.id);

      await prisma.storyView.create({ data: { storyId: story.id, viewerId: viewer.id } });
      await prisma.storyLike.create({ data: { storyId: story.id, likerId: viewer.id } });

      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      const res = await DELETE(deleteReq(story.id), { params: Promise.resolve({ id: story.id }) });
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);

      expect(await prisma.story.findUnique({ where: { id: story.id } })).toBeNull();
      expect(await prisma.storyView.findMany({ where: { storyId: story.id } })).toHaveLength(0);
      expect(await prisma.storyLike.findMany({ where: { storyId: story.id } })).toHaveLength(0);
    });

    it("a deleted story disappears from GET /api/stories and cannot be reopened via view/like", async () => {
      const owner = await createUser();
      const story = await createStory(owner.id);

      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      await DELETE(deleteReq(story.id), { params: Promise.resolve({ id: story.id }) });

      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      const listRes = await listStories(new NextRequest("https://zrp.one/api/stories"));
      const groups = await listRes.json();
      const ownGroup = groups.find((g: any) => g.user.id === owner.id);
      expect(ownGroup?.stories.some((s: any) => s.id === story.id)).not.toBe(true);

      // The old story's own URL/id no longer resolves to anything -
      // POST .../view (the same request an already-open viewer would
      // still fire for a story that vanished mid-view) must not throw a
      // raw FK-violation 500; it should cleanly 404.
      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      const viewRes = await viewStory(viewReq(story.id), { params: Promise.resolve({ id: story.id }) });
      expect(viewRes.status).toBe(404);
    });

    it("expired-but-not-yet-purged stories still delete correctly", async () => {
      const owner = await createUser();
      const story = await prisma.story.create({
        data: {
          userId: owner.id,
          content: "Expired story",
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      const res = await DELETE(deleteReq(story.id), { params: Promise.resolve({ id: story.id }) });
      expect(res.status).toBe(200);
      expect(await prisma.story.findUnique({ where: { id: story.id } })).toBeNull();
    });
  });

  describe("PUT (edit)", () => {
    it("rejects an unauthenticated request", async () => {
      getServerSession.mockResolvedValueOnce(null);
      const owner = await createUser();
      const story = await createStory(owner.id);
      const res = await PUT(putReq(story.id, { content: "edited" }), {
        params: Promise.resolve({ id: story.id }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects an edit by a non-owner", async () => {
      const owner = await createUser();
      const attacker = await createUser();
      const story = await createStory(owner.id);

      getServerSession.mockResolvedValueOnce({ user: { id: attacker.id } });
      const res = await PUT(putReq(story.id, { content: "hacked" }), {
        params: Promise.resolve({ id: story.id }),
      });
      expect(res.status).toBe(403);

      const unchanged = await prisma.story.findUnique({ where: { id: story.id } });
      expect(unchanged?.content).toBe("Original story text");
    });

    it("lets the owner correct their own story's text - the exact reported bug", async () => {
      const owner = await createUser();
      const story = await createStory(owner.id, { content: "my wrods are incomplete" });

      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      const res = await PUT(putReq(story.id, { content: "my words are now complete" }), {
        params: Promise.resolve({ id: story.id }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.content).toBe("my words are now complete");

      const persisted = await prisma.story.findUnique({ where: { id: story.id } });
      expect(persisted?.content).toBe("my words are now complete");
    });

    it("rejects blanking a text-only story down to nothing", async () => {
      const owner = await createUser();
      const story = await createStory(owner.id, { content: "text only, no media" });

      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      const res = await PUT(putReq(story.id, { content: "   " }), {
        params: Promise.resolve({ id: story.id }),
      });
      expect(res.status).toBe(400);
    });

    it("allows clearing the caption on a media story (media stays untouched)", async () => {
      const owner = await createUser();
      const story = await createStory(owner.id, {
        content: "a caption",
        mediaUrl: "https://utfs.io/f/keepme.jpg",
        mediaType: "image",
      });

      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      const res = await PUT(putReq(story.id, { content: "" }), {
        params: Promise.resolve({ id: story.id }),
      });
      expect(res.status).toBe(200);

      const persisted = await prisma.story.findUnique({ where: { id: story.id } });
      expect(persisted?.content).toBeNull();
      expect(persisted?.mediaUrl).toBe("https://utfs.io/f/keepme.jpg");
    });

    it("404s for a story that doesn't exist", async () => {
      const owner = await createUser();
      getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
      const res = await PUT(putReq("nonexistent-story-id", { content: "x" }), {
        params: Promise.resolve({ id: "nonexistent-story-id" }),
      });
      expect(res.status).toBe(404);
    });
  });
});
