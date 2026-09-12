import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getUserConversations } from "@/lib/conversations";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { DELETE } from "../route";
import { GET as getMessages } from "../../../[userId]/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(otherUserId: string, ip?: string) {
  return DELETE(
    new NextRequest(`https://zrp.one/api/messages/conversation/${otherUserId}`, {
      method: "DELETE",
      headers: { "x-forwarded-for": ip || `203.0.113.${Math.floor(Math.random() * 250) + 1}` },
    }),
    { params: Promise.resolve({ userId: otherUserId }) },
  );
}

function fetchMessages(otherUserId: string) {
  return getMessages(
    new NextRequest(`https://zrp.one/api/messages/${otherUserId}`, {
      headers: { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}` },
    }),
    { params: Promise.resolve({ userId: otherUserId }) },
  );
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

// "Delete conversation" (the API route already existed - see
// src/app/api/messages/conversation/[userId]/route.ts - but had no test
// coverage and, until a recent change, no UI ever called it) used to
// hard-delete every Message row shared with the other user, destroying
// THEIR copy of the conversation too even though the confirmation UI only
// ever promised to delete "your conversation". It now records a
// per-user ConversationClearance marker instead: only the caller's own
// view is hidden (via GET /api/messages/[userId] and
// getUserConversations), the other participant's messages and any
// attachments are completely untouched, and a new message sent
// afterward makes the conversation reappear normally for both sides.
describe.skipIf(!hasRealDatabaseUrl)("DELETE /api/messages/conversation/[userId] (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: { email: `${label}-${suffix}@convdeltest.example`, username: `${label}${suffix}`.slice(0, 20), password: "x" },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.conversationClearance.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getServerSession.mockReset();
  });

  it("returns 401 for an unauthenticated request", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await call(randomUUID());
    expect(res.status).toBe(401);
  });

  it("hides the conversation from the deleting user's own view without touching the underlying messages", async () => {
    const a = await createUser("conva");
    const b = await createUser("convb");
    await prisma.message.create({ data: { senderId: a.id, receiverId: b.id, content: "hi" } });
    await prisma.message.create({ data: { senderId: b.id, receiverId: a.id, content: "hey" } });
    await prisma.message.create({ data: { senderId: a.id, receiverId: b.id, content: "how are you" } });

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const res = await call(b.id);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // The messages themselves must never be destroyed - only A's own
    // view of the conversation was supposed to change.
    const remaining = await prisma.message.count({
      where: { OR: [{ senderId: a.id, receiverId: b.id }, { senderId: b.id, receiverId: a.id }] },
    });
    expect(remaining).toBe(3);

    // A no longer sees the old history...
    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const aView = await fetchMessages(b.id);
    expect(await aView.json()).toEqual([]);

    // ...but B's own view of the exact same conversation is completely
    // untouched - this is the core guarantee the old hard-delete broke.
    getServerSession.mockResolvedValueOnce(sessionFor(b.id));
    const bView = await fetchMessages(a.id);
    expect((await bView.json()).length).toBe(3);
  });

  it("a message sent after clearing makes the conversation reappear for both sides", async () => {
    const a = await createUser("convj");
    const b = await createUser("convk");
    await prisma.message.create({ data: { senderId: a.id, receiverId: b.id, content: "before" } });

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    await call(b.id);

    const fresh = await prisma.message.create({ data: { senderId: b.id, receiverId: a.id, content: "after" } });

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const aView = await fetchMessages(b.id);
    const aMessages = await aView.json();
    expect(aMessages.map((m: { id: string }) => m.id)).toEqual([fresh.id]);

    const aConversations = await getUserConversations(a.id);
    expect(aConversations.find((c) => c.partner.id === b.id)?.lastMessage.id).toBe(fresh.id);
  });

  it("removes the partner from the deleting user's conversation list but not the other participant's", async () => {
    const a = await createUser("convl");
    const b = await createUser("convm");
    await prisma.message.create({ data: { senderId: a.id, receiverId: b.id, content: "hi" } });

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    await call(b.id);

    const aConversations = await getUserConversations(a.id);
    expect(aConversations.some((c) => c.partner.id === b.id)).toBe(false);

    const bConversations = await getUserConversations(b.id);
    expect(bConversations.some((c) => c.partner.id === a.id)).toBe(true);
  });

  it("never touches a third party's unrelated messages with either user", async () => {
    const a = await createUser("convc");
    const b = await createUser("convd");
    const c = await createUser("conve");
    await prisma.message.create({ data: { senderId: a.id, receiverId: b.id, content: "a to b" } });
    const unrelated = await prisma.message.create({ data: { senderId: a.id, receiverId: c.id, content: "a to c" } });
    const unrelated2 = await prisma.message.create({ data: { senderId: c.id, receiverId: b.id, content: "c to b" } });

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const res = await call(b.id);
    expect(res.status).toBe(200);

    const stillThere1 = await prisma.message.findUnique({ where: { id: unrelated.id } });
    const stillThere2 = await prisma.message.findUnique({ where: { id: unrelated2.id } });
    expect(stillThere1).not.toBeNull();
    expect(stillThere2).not.toBeNull();
  });

  it("succeeds (idempotently) even when there is no conversation to delete", async () => {
    const a = await createUser("convf");
    const b = await createUser("convg");
    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const res = await call(b.id);
    expect(res.status).toBe(200);
  });

  it("can be called again safely after the conversation is already gone", async () => {
    const a = await createUser("convh");
    const b = await createUser("convi");
    await prisma.message.create({ data: { senderId: a.id, receiverId: b.id, content: "hi" } });

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const first = await call(b.id);
    expect(first.status).toBe(200);

    getServerSession.mockResolvedValueOnce(sessionFor(a.id));
    const second = await call(b.id);
    expect(second.status).toBe(200);
  });

  it("enforces its own rate limit against repeated conversation-delete requests", async () => {
    const a = await createUser("convratelimited");
    getServerSession.mockResolvedValue(sessionFor(a.id));
    const sharedIp = "203.0.113.240";
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await call(randomUUID(), sharedIp)).status);
    }
    expect(statuses).toContain(429);
  });
});
