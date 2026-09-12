import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST as createList, PATCH as patchList, DELETE as deleteList } from "../[id]/route";
import { GET as getList } from "../[id]/route";
import { POST as addMember } from "../[id]/members/route";
import { DELETE as removeMember } from "../[id]/members/[userId]/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

function callGet(id: string) {
  return getList(new NextRequest(`https://zrp.one/api/lists/${id}`), {
    params: Promise.resolve({ id }),
  });
}
function callPatch(id: string, data: Record<string, unknown>) {
  return patchList(
    new NextRequest(`https://zrp.one/api/lists/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    { params: Promise.resolve({ id }) },
  );
}
function callDelete(id: string) {
  return deleteList(new NextRequest(`https://zrp.one/api/lists/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}
function callAddMember(id: string, username: string) {
  return addMember(
    new NextRequest(`https://zrp.one/api/lists/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
    { params: Promise.resolve({ id }) },
  );
}
function callRemoveMember(id: string, userId: string) {
  return removeMember(
    new NextRequest(`https://zrp.one/api/lists/${id}/members/${userId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id, userId }) },
  );
}

// Lists are curated by their owner only - this is the trust boundary a
// fake/client-only "Lists" UI could get wrong entirely: a non-owner
// must never be able to add/remove members or edit/delete someone
// else's list, and a private list must stay invisible to everyone but
// its owner.
describe.skipIf(!hasRealDatabaseUrl)("Lists ownership + privacy (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let listId: string;
  let ownerId: string;
  let strangerId: string;
  let memberUser: { id: string; username: string };

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: { email: `${label}-${suffix}@listtest.example`, username: `${label}${suffix}`.slice(0, 20), password: "x" },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.listMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.list.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getServerSession.mockReset();
  });

  it("creates a private list owned by its creator", async () => {
    const owner = await createUser("owner");
    ownerId = owner.id;
    getServerSession.mockResolvedValueOnce(sessionFor(ownerId));

    const res = await createList(
      new NextRequest("https://zrp.one/api/lists", {
        method: "POST",
        body: JSON.stringify({ name: `Close Friends ${suffix}`, isPrivate: true }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    listId = body.list.id;
  });

  it("hides a private list from a non-owner (403) but shows it to the owner", async () => {
    const stranger = await createUser("stranger");
    strangerId = stranger.id;

    getServerSession.mockResolvedValueOnce(sessionFor(strangerId));
    const strangerRes = await callGet(listId);
    expect(strangerRes.status).toBe(403);

    getServerSession.mockResolvedValueOnce(sessionFor(ownerId));
    const ownerRes = await callGet(listId);
    expect(ownerRes.status).toBe(200);
  });

  it("rejects a non-owner adding a member", async () => {
    const target = await createUser("target");
    memberUser = target;

    getServerSession.mockResolvedValueOnce(sessionFor(strangerId));
    const res = await callAddMember(listId, target.username);
    expect(res.status).toBe(403);
  });

  it("lets the owner add and then remove a member", async () => {
    getServerSession.mockResolvedValueOnce(sessionFor(ownerId));
    const addRes = await callAddMember(listId, memberUser.username);
    expect(addRes.status).toBe(201);

    getServerSession.mockResolvedValueOnce(sessionFor(ownerId));
    const getRes = await callGet(listId);
    const getBody = await getRes.json();
    expect(getBody.list.memberCount).toBe(1);

    getServerSession.mockResolvedValueOnce(sessionFor(strangerId));
    const rejectedRemove = await callRemoveMember(listId, memberUser.id);
    expect(rejectedRemove.status).toBe(403);

    getServerSession.mockResolvedValueOnce(sessionFor(ownerId));
    const removeRes = await callRemoveMember(listId, memberUser.id);
    expect(removeRes.status).toBe(200);
  });

  it("rejects a non-owner editing or deleting the list", async () => {
    getServerSession.mockResolvedValueOnce(sessionFor(strangerId));
    const patchRes = await callPatch(listId, { name: "Hijacked" });
    expect(patchRes.status).toBe(403);

    getServerSession.mockResolvedValueOnce(sessionFor(strangerId));
    const deleteRes = await callDelete(listId);
    expect(deleteRes.status).toBe(403);
  });
});
