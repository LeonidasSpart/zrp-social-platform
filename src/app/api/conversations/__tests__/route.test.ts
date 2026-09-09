import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET as listConversations, POST as createConversation } from "../route";
import { GET as getConversation } from "../[id]/route";
import { GET as listMessages, POST as sendMessage } from "../[id]/messages/route";
import { POST as addParticipants } from "../[id]/participants/route";
import { DELETE as removeParticipant } from "../[id]/participants/[userId]/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

function jsonReq(url: string, body?: unknown, method = "POST") {
  return new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" },
  });
}

// This whole file is a real-Postgres integration test, same convention
// as messages/[userId]/__tests__/route.test.ts - skipped wherever no
// real database is configured (this repo has no dedicated web CI
// workflow that runs vitest at all; these routes are the security-
// critical part of the group chat backend, so they're validated for
// real against an actual Postgres, matching how the migration itself
// was validated, rather than trusted on inspection alone).
describe.skipIf(!hasRealDatabaseUrl)("Group chat API (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const conversationIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@grouptest.example`,
        username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
        password: "x",
        role: "USER",
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversationParticipant.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function makeGroup(owner: { id: string }, others: { id: string }[], name = "Test Group") {
    getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
    const res = await createConversation(
      jsonReq("https://zrp.one/api/conversations", { name, participantIds: others.map((u) => u.id) })
    );
    const body = await res.json();
    conversationIds.push(body.id);
    return body as { id: string };
  }

  it("401s without a session", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await listConversations(new NextRequest("https://zrp.one/api/conversations"));
    expect(res.status).toBe(401);
  });

  it("rejects creating a group with fewer than 2 other real members", async () => {
    const owner = await createUser("owner");
    const only = await createUser("only");
    getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
    const res = await createConversation(
      jsonReq("https://zrp.one/api/conversations", { name: "Too Small", participantIds: [only.id] })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a nonexistent participant id", async () => {
    const owner = await createUser("ownerx");
    const real = await createUser("realx");
    getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
    const res = await createConversation(
      jsonReq("https://zrp.one/api/conversations", {
        name: "Fake Member",
        participantIds: [real.id, "not-a-real-user-id"],
      })
    );
    expect(res.status).toBe(404);
  });

  it("creates a real group with the creator as OWNER and the rest as MEMBER", async () => {
    const owner = await createUser("realowner");
    const memberA = await createUser("membera");
    const memberB = await createUser("memberb");
    const group = await makeGroup(owner, [memberA, memberB]);

    const roles = new Map(
      (group as unknown as { participants: { userId: string; role: string }[] }).participants.map((p) => [
        p.userId,
        p.role,
      ])
    );
    expect(roles.get(owner.id)).toBe("OWNER");
    expect(roles.get(memberA.id)).toBe("MEMBER");
    expect(roles.get(memberB.id)).toBe("MEMBER");
  });

  it("blocks group creation when the creator has blocked (or is blocked by) a requested member", async () => {
    const owner = await createUser("blockowner");
    const blocked = await createUser("blockeduser");
    const other = await createUser("otheruser");
    await prisma.blocked.create({ data: { blockerId: owner.id, blockedId: blocked.id } });

    getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
    const res = await createConversation(
      jsonReq("https://zrp.one/api/conversations", {
        name: "Blocked Member",
        participantIds: [blocked.id, other.id],
      })
    );
    expect(res.status).toBe(403);
  });

  it("a non-member gets 404, not 403, reading a group's detail or messages (never leaks that a private group exists)", async () => {
    const owner = await createUser("privowner");
    const memberA = await createUser("privmembera");
    const memberB = await createUser("privmemberb");
    const outsider = await createUser("privoutsider");
    const group = await makeGroup(owner, [memberA, memberB]);

    getServerSession.mockResolvedValueOnce(sessionFor(outsider.id));
    const detailRes = await getConversation(
      new NextRequest(`https://zrp.one/api/conversations/${group.id}`),
      { params: Promise.resolve({ id: group.id }) }
    );
    expect(detailRes.status).toBe(404);

    getServerSession.mockResolvedValueOnce(sessionFor(outsider.id));
    const messagesRes = await listMessages(
      new NextRequest(`https://zrp.one/api/conversations/${group.id}/messages`),
      { params: Promise.resolve({ id: group.id }) }
    );
    expect(messagesRes.status).toBe(404);
  });

  it("a non-member cannot send a message into the group", async () => {
    const owner = await createUser("sendowner");
    const memberA = await createUser("sendmembera");
    const memberB = await createUser("sendmemberb");
    const outsider = await createUser("sendoutsider");
    const group = await makeGroup(owner, [memberA, memberB]);

    getServerSession.mockResolvedValueOnce(sessionFor(outsider.id));
    const res = await sendMessage(
      jsonReq(`https://zrp.one/api/conversations/${group.id}/messages`, { content: "sneaky" }),
      { params: Promise.resolve({ id: group.id }) }
    );
    expect(res.status).toBe(404);
  });

  it("a real member can send a real message with a null receiverId and a real conversationId", async () => {
    const owner = await createUser("okowner");
    const memberA = await createUser("okmembera");
    const memberB = await createUser("okmemberb");
    const group = await makeGroup(owner, [memberA, memberB]);

    getServerSession.mockResolvedValueOnce(sessionFor(memberA.id));
    const res = await sendMessage(
      jsonReq(`https://zrp.one/api/conversations/${group.id}/messages`, { content: "hello group" }),
      { params: Promise.resolve({ id: group.id }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.conversationId).toBe(group.id);
    expect(body.receiverId).toBeNull();
    expect(body.senderId).toBe(memberA.id);
  });

  it("only the OWNER can remove a different member; any member can leave (remove themselves)", async () => {
    const owner = await createUser("rmowner");
    const memberA = await createUser("rmmembera");
    const memberB = await createUser("rmmemberb");
    const group = await makeGroup(owner, [memberA, memberB]);

    // memberA (not OWNER) tries to remove memberB - forbidden.
    getServerSession.mockResolvedValueOnce(sessionFor(memberA.id));
    const forbidden = await removeParticipant(
      new NextRequest(`https://zrp.one/api/conversations/${group.id}/participants/${memberB.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: group.id, userId: memberB.id }) }
    );
    expect(forbidden.status).toBe(403);

    // memberA leaves (removes themselves) - always allowed.
    getServerSession.mockResolvedValueOnce(sessionFor(memberA.id));
    const selfLeave = await removeParticipant(
      new NextRequest(`https://zrp.one/api/conversations/${group.id}/participants/${memberA.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: group.id, userId: memberA.id }) }
    );
    expect(selfLeave.status).toBe(200);

    // The removed participant's row is really gone - this IS the
    // authorization boundary, not a soft flag.
    const stillMember = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: group.id, userId: memberA.id } },
    });
    expect(stillMember).toBeNull();

    // A user who already left the group can no longer read it.
    getServerSession.mockResolvedValueOnce(sessionFor(memberA.id));
    const afterLeaveRes = await getConversation(
      new NextRequest(`https://zrp.one/api/conversations/${group.id}`),
      { params: Promise.resolve({ id: group.id }) }
    );
    expect(afterLeaveRes.status).toBe(404);

    // The OWNER removing memberB (an actual other member) works.
    getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
    const ownerRemoves = await removeParticipant(
      new NextRequest(`https://zrp.one/api/conversations/${group.id}/participants/${memberB.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: group.id, userId: memberB.id }) }
    );
    expect(ownerRemoves.status).toBe(200);
  });

  it("a non-member cannot add new participants either", async () => {
    const owner = await createUser("addowner");
    const memberA = await createUser("addmembera");
    const memberB = await createUser("addmemberb");
    const outsider = await createUser("addoutsider");
    const newPerson = await createUser("addnewperson");
    const group = await makeGroup(owner, [memberA, memberB]);

    getServerSession.mockResolvedValueOnce(sessionFor(outsider.id));
    const res = await addParticipants(
      jsonReq(`https://zrp.one/api/conversations/${group.id}/participants`, { participantIds: [newPerson.id] }),
      { params: Promise.resolve({ id: group.id }) }
    );
    expect(res.status).toBe(404);
  });

  it("any current member can add a new real participant", async () => {
    const owner = await createUser("addokowner");
    const memberA = await createUser("addokmembera");
    const memberB = await createUser("addokmemberb");
    const newPerson = await createUser("addoknewperson");
    const group = await makeGroup(owner, [memberA, memberB]);

    getServerSession.mockResolvedValueOnce(sessionFor(memberA.id));
    const res = await addParticipants(
      jsonReq(`https://zrp.one/api/conversations/${group.id}/participants`, { participantIds: [newPerson.id] }),
      { params: Promise.resolve({ id: group.id }) }
    );
    expect(res.status).toBe(201);

    const membership = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: group.id, userId: newPerson.id } },
    });
    expect(membership).not.toBeNull();
    expect(membership?.role).toBe("MEMBER");
  });

  it("unread count reflects real lastReadAt, and reading messages advances it", async () => {
    const owner = await createUser("unreadowner");
    const memberA = await createUser("unreadmembera");
    const memberB = await createUser("unreadmemberb");
    const group = await makeGroup(owner, [memberA, memberB]);

    getServerSession.mockResolvedValueOnce(sessionFor(owner.id));
    await sendMessage(jsonReq(`https://zrp.one/api/conversations/${group.id}/messages`, { content: "msg 1" }), {
      params: Promise.resolve({ id: group.id }),
    });

    const before = await listConversations(new NextRequest("https://zrp.one/api/conversations"));
    void before; // memberA hasn't been checked yet below; this call is just to exercise GET as owner harmlessly

    getServerSession.mockResolvedValueOnce(sessionFor(memberA.id));
    const listRes = await listConversations(new NextRequest("https://zrp.one/api/conversations"));
    const list = await listRes.json();
    const thisGroup = list.find((g: { id: string }) => g.id === group.id);
    expect(thisGroup.unreadCount).toBe(1);

    // Reading the conversation's messages advances memberA's own
    // lastReadAt, clearing the unread count exactly like 1:1's own
    // GET /messages/{userId} does.
    getServerSession.mockResolvedValueOnce(sessionFor(memberA.id));
    await listMessages(new NextRequest(`https://zrp.one/api/conversations/${group.id}/messages`), {
      params: Promise.resolve({ id: group.id }),
    });

    getServerSession.mockResolvedValueOnce(sessionFor(memberA.id));
    const afterRes = await listConversations(new NextRequest("https://zrp.one/api/conversations"));
    const afterList = await afterRes.json();
    const afterGroup = afterList.find((g: { id: string }) => g.id === group.id);
    expect(afterGroup.unreadCount).toBe(0);
  });
});
