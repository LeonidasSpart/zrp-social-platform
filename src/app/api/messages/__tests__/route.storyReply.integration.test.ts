import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function randomIp() {
  return `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
}

function call(body: Record<string, unknown>) {
  return POST(
    new NextRequest("https://zrp.one/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": randomIp() },
      body: JSON.stringify(body),
    }),
  );
}

function sessionFor(userId: string, extra: Record<string, unknown> = {}) {
  return { user: { id: userId, name: "Test User", username: "testuser", ...extra } };
}

// A story reply is a private DM tagged with the Story it was sent in
// response to (Message.storyId) rather than a new messaging system -
// see the design note on Message.storyId in prisma/schema.prisma. These
// lock in the authorization that makes that safe: the recipient is
// always derived from the Story's own row, never trusted from the
// client, and every existing DM protection (blocking) plus every
// story-specific rule (follow-only visibility, no self-reply, no reply
// to an expired story) applies identically to this path.
describe.skipIf(!hasRealDatabaseUrl)("POST /api/messages storyId (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const storyIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@storyreplytest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createStory(authorId: string, opts: { expired?: boolean } = {}) {
    const story = await prisma.story.create({
      data: {
        userId: authorId,
        content: "hello from a story",
        expiresAt: opts.expired
          ? new Date(Date.now() - 60 * 60 * 1000)
          : new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    storyIds.push(story.id);
    return story;
  }

  async function follow(followerId: string, followingId: string) {
    await prisma.follow.create({ data: { followerId, followingId } });
  }

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { fromUserId: { in: userIds } } });
    await prisma.storyView.deleteMany({ where: { storyId: { in: storyIds } } });
    await prisma.storyLike.deleteMany({ where: { storyId: { in: storyIds } } });
    await prisma.follow.deleteMany({ where: { followerId: { in: userIds } } });
    await prisma.blocked.deleteMany({ where: { blockerId: { in: userIds } } });
    await prisma.story.deleteMany({ where: { id: { in: storyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getServerSession.mockReset();
  });

  it("returns 404 for a storyId that doesn't exist", async () => {
    const replier = await createUser("noexist-replier");
    getServerSession.mockResolvedValueOnce(sessionFor(replier.id));

    const res = await call({ content: "hi", storyId: "does-not-exist-" + randomUUID() });
    expect(res.status).toBe(404);
  });

  it("rejects replying to your own story", async () => {
    const author = await createUser("self-author");
    const story = await createStory(author.id);
    getServerSession.mockResolvedValueOnce(sessionFor(author.id));

    const res = await call({ content: "hi", storyId: story.id });
    expect(res.status).toBe(400);
  });

  it("rejects a reply from someone who doesn't follow the author - never trusts the visibility a client claims", async () => {
    const author = await createUser("nofollow-author");
    const stranger = await createUser("nofollow-stranger");
    const story = await createStory(author.id);
    getServerSession.mockResolvedValueOnce(sessionFor(stranger.id));

    // Deliberately also sends an unrelated receiverId to prove it's ignored.
    const res = await call({ content: "hi", storyId: story.id, receiverId: stranger.id });
    expect(res.status).toBe(403);
  });

  it("rejects a reply to an expired story - matches GET /api/stories, which stops serving it too", async () => {
    const author = await createUser("expired-author");
    const follower = await createUser("expired-follower");
    await follow(follower.id, author.id);
    const story = await createStory(author.id, { expired: true });
    getServerSession.mockResolvedValueOnce(sessionFor(follower.id));

    const res = await call({ content: "hi", storyId: story.id });
    expect(res.status).toBe(410);
  });

  it("rejects a reply when either party has blocked the other", async () => {
    const author = await createUser("blocked-author");
    const follower = await createUser("blocked-follower");
    await follow(follower.id, author.id);
    await prisma.blocked.create({ data: { blockerId: author.id, blockedId: follower.id } });
    const story = await createStory(author.id);
    getServerSession.mockResolvedValueOnce(sessionFor(follower.id));

    const res = await call({ content: "hi", storyId: story.id });
    expect(res.status).toBe(403);
  });

  it("lets a follower reply to a visible story: creates a Message with storyId + the true author as receiver, ignoring any client-sent receiverId, and a notification", async () => {
    const author = await createUser("happy-author");
    const follower = await createUser("happy-follower");
    const decoy = await createUser("happy-decoy");
    await follow(follower.id, author.id);
    const story = await createStory(author.id);
    getServerSession.mockResolvedValueOnce(sessionFor(follower.id));

    const res = await call({ content: "love this!", storyId: story.id, receiverId: decoy.id });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.receiverId).toBe(author.id);
    expect(body.senderId).toBe(follower.id);
    expect(body.story?.id).toBe(story.id);

    const stored = await prisma.message.findUnique({ where: { id: body.id } });
    expect(stored?.storyId).toBe(story.id);
    expect(stored?.receiverId).toBe(author.id);

    const notification = await prisma.notification.findFirst({
      where: { userId: author.id, fromUserId: follower.id, type: "message" },
      orderBy: { createdAt: "desc" },
    });
    expect(notification).not.toBeNull();
  });

  it("does not require the story to be given via a separate content mode - text-only reply still respects MAX_MESSAGE_LENGTH validation upstream", async () => {
    const author = await createUser("empty-author");
    const follower = await createUser("empty-follower");
    await follow(follower.id, author.id);
    const story = await createStory(author.id);
    getServerSession.mockResolvedValueOnce(sessionFor(follower.id));

    const res = await call({ content: "   ", storyId: story.id });
    expect(res.status).toBe(400);
  });
});
