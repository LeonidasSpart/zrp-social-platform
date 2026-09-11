import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { DELETE } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(messageId: string, ip?: string) {
  return DELETE(
    new NextRequest(`https://zrp.one/api/messages/delete/${messageId}`, {
      method: "DELETE",
      headers: { "x-forwarded-for": ip || `203.0.113.${Math.floor(Math.random() * 250) + 1}` },
    }),
    { params: Promise.resolve({ id: messageId }) },
  );
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

// Regression coverage for the release-critical bug: message deletion
// appeared broken on every platform. The root cause turned out to be the
// frontend (ChatInterface.tsx/GroupChatInterface.tsx gating the whole
// flow behind window.confirm(), which many real deployment surfaces -
// iOS standalone PWA, in-app browsers - silently no-op instead of
// prompting) rather than this API route, which already enforced the
// right authorization. These tests lock in that the backend stays
// authoritative and correct independent of the frontend fix.
describe.skipIf(!hasRealDatabaseUrl)("DELETE /api/messages/delete/[id] (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const conversationIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@msgdeltest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createDirectMessage(senderId: string, receiverId: string, content = "hello") {
    return prisma.message.create({
      data: { senderId, receiverId, content },
    });
  }

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
    await prisma.conversationParticipant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getServerSession.mockReset();
  });

  it("returns 401 for an unauthenticated request", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const message = await prisma.message.create({
      data: {
        senderId: (await createUser("anon-sender")).id,
        receiverId: (await createUser("anon-receiver")).id,
        content: "x",
      },
    });
    const res = await call(message.id);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a message id that does not exist", async () => {
    const user = await createUser("nouser");
    getServerSession.mockResolvedValueOnce(sessionFor(user.id));
    const res = await call("does-not-exist-" + randomUUID());
    expect(res.status).toBe(404);
  });

  it("lets the sender delete their own 1:1 message, and it is actually gone from the DB", async () => {
    const a = await createUser("sender1");
    const b = await createUser("receiver1");
    const message = await createDirectMessage(a.id, b.id);

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const res = await call(message.id);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const stillThere = await prisma.message.findUnique({ where: { id: message.id } });
    expect(stillThere).toBeNull();
  });

  it("lets the receiver of a 1:1 message delete it too (either party)", async () => {
    const a = await createUser("sender2");
    const b = await createUser("receiver2");
    const message = await createDirectMessage(a.id, b.id);

    getServerSession.mockResolvedValueOnce(sessionFor(b.id));
    const res = await call(message.id);
    expect(res.status).toBe(200);

    const stillThere = await prisma.message.findUnique({ where: { id: message.id } });
    expect(stillThere).toBeNull();
  });

  it("never lets a third party (not sender, not receiver) delete a 1:1 message - no IDOR", async () => {
    const a = await createUser("sender3");
    const b = await createUser("receiver3");
    const stranger = await createUser("stranger3");
    const message = await createDirectMessage(a.id, b.id);

    getServerSession.mockResolvedValueOnce(sessionFor(stranger.id));
    const res = await call(message.id);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBeTruthy();

    // The message must survive an unauthorized attempt untouched.
    const stillThere = await prisma.message.findUnique({ where: { id: message.id } });
    expect(stillThere).not.toBeNull();
  });

  it("handles an already-deleted message id safely (second delete returns 404, does not throw)", async () => {
    const a = await createUser("sender4");
    const b = await createUser("receiver4");
    const message = await createDirectMessage(a.id, b.id);

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const first = await call(message.id);
    expect(first.status).toBe(200);

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const second = await call(message.id);
    expect(second.status).toBe(404);
  });

  it("rejects an obviously invalid/malformed message id the same safe way (404, not a 500)", async () => {
    const user = await createUser("invalidid");
    getServerSession.mockResolvedValueOnce(sessionFor(user.id));
    const res = await call("' OR 1=1 --");
    expect(res.status).toBe(404);
  });

  describe("group messages", () => {
    async function createGroup(ownerId: string, memberIds: string[]) {
      const conversation = await prisma.conversation.create({
        data: {
          type: "GROUP",
          name: "Delete test group",
          createdById: ownerId,
          participants: {
            create: [
              { userId: ownerId, role: "OWNER" },
              ...memberIds.map((id) => ({ userId: id, role: "MEMBER" as const })),
            ],
          },
        },
      });
      conversationIds.push(conversation.id);
      return conversation;
    }

    it("lets a member delete their own group message", async () => {
      const owner = await createUser("gowner1");
      const member = await createUser("gmember1");
      const conversation = await createGroup(owner.id, [member.id]);
      const message = await prisma.message.create({
        data: { senderId: member.id, conversationId: conversation.id, content: "hi group" },
      });

      getServerSession.mockResolvedValueOnce(sessionFor(member.id));
      const res = await call(message.id);
      expect(res.status).toBe(200);

      const stillThere = await prisma.message.findUnique({ where: { id: message.id } });
      expect(stillThere).toBeNull();
    });

    it("lets the OWNER delete another member's group message (moderation)", async () => {
      const owner = await createUser("gowner2");
      const member = await createUser("gmember2");
      const conversation = await createGroup(owner.id, [member.id]);
      const message = await prisma.message.create({
        data: { senderId: member.id, conversationId: conversation.id, content: "hi group" },
      });

      getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
      const res = await call(message.id);
      expect(res.status).toBe(200);
    });

    it("never lets a plain MEMBER delete another member's group message - no IDOR", async () => {
      const owner = await createUser("gowner3");
      const memberA = await createUser("gmembera3");
      const memberB = await createUser("gmemberb3");
      const conversation = await createGroup(owner.id, [memberA.id, memberB.id]);
      const message = await prisma.message.create({
        data: { senderId: memberA.id, conversationId: conversation.id, content: "hi group" },
      });

      getServerSession.mockResolvedValueOnce(sessionFor(memberB.id));
      const res = await call(message.id);
      expect(res.status).toBe(403);

      const stillThere = await prisma.message.findUnique({ where: { id: message.id } });
      expect(stillThere).not.toBeNull();
    });

    it("never lets someone outside the group delete a group message - no IDOR", async () => {
      const owner = await createUser("gowner4");
      const member = await createUser("gmember4");
      const outsider = await createUser("goutsider4");
      const conversation = await createGroup(owner.id, [member.id]);
      const message = await prisma.message.create({
        data: { senderId: member.id, conversationId: conversation.id, content: "hi group" },
      });

      getServerSession.mockResolvedValueOnce(sessionFor(outsider.id));
      const res = await call(message.id);
      expect(res.status).toBe(403);
    });
  });

  it("enforces its own rate limit against repeated delete requests from one source", async () => {
    const a = await createUser("ratelimited-sender");
    const b = await createUser("ratelimited-receiver");
    getServerSession.mockResolvedValue(sessionFor(a.id));

    const sharedIp = "203.0.113.250";
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) {
      const message = await createDirectMessage(a.id, b.id);
      statuses.push((await call(message.id, sharedIp)).status);
    }
    expect(statuses).toContain(429);
  });
});
