import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession, logAdminAction } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { POST as join } from "../[id]/join/route";
import { POST as leave } from "../[id]/leave/route";
import { OWNER_CANNOT_LEAVE_MESSAGE } from "@/lib/communities";
import { GET as detail, DELETE as remove } from "../[id]/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function sessionFor(userId: string) {
  return { user: { id: userId } };
}
function callJoin(id: string) {
  return join(new NextRequest(`https://zrp.one/api/communities/${id}/join`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}
function callLeave(id: string) {
  return leave(new NextRequest(`https://zrp.one/api/communities/${id}/leave`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}
function callDetail(id: string) {
  return detail(new NextRequest(`https://zrp.one/api/communities/${id}`), {
    params: Promise.resolve({ id }),
  });
}
function callDelete(id: string) {
  return remove(new NextRequest(`https://zrp.one/api/communities/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

/*
 * The community lifecycle's trust boundary: who may leave, who may
 * delete. The OWNER role is what every client shows the Delete
 * control off, and the owner-cannot-leave rule is what keeps that
 * role from ever going missing. isSessionAdmin is real here (it reads
 * User.role/isAdmin from the DB), so the "site admin" case uses a real
 * ADMIN row, not a mocked claim.
 */
describe.skipIf(!hasRealDatabaseUrl)("Community leave/delete authorization (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const communityIds: string[] = [];

  async function createUser(label: string, extra: Record<string, unknown> = {}) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@communityauthz.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
        ...extra,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createCommunity(ownerId: string, label: string) {
    const community = await prisma.community.create({
      data: {
        slug: `${label}-${suffix}`,
        name: `${label} ${suffix}`,
        description: "A real community row for the authz tests.",
        hashtag: `${label}${suffix}`.toLowerCase(),
        createdById: ownerId,
        memberCount: 1,
        members: { create: { userId: ownerId, role: "OWNER" } },
      },
    });
    communityIds.push(community.id);
    return community;
  }

  afterAll(async () => {
    await prisma.communityMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getServerSession.mockReset();
    logAdminAction.mockReset();
  });

  it("a plain member can leave; memberCount follows the real rows", async () => {
    const owner = await createUser("lowner");
    const member = await createUser("lmember");
    const community = await createCommunity(owner.id, "leavable");

    getServerSession.mockResolvedValue(sessionFor(member.id));
    expect((await callJoin(community.id)).status).toBe(200);
    expect((await (await callDetail(community.id)).json()).community.memberCount).toBe(2);

    const res = await callLeave(community.id);
    expect(res.status).toBe(200);
    expect((await res.json()).isMember).toBe(false);

    const after = await (await callDetail(community.id)).json();
    expect(after.community.memberCount).toBe(1);
    expect(after.isMember).toBe(false);
    expect(after.myRole).toBeNull();
    expect(after.canDelete).toBe(false);
  });

  it("the OWNER cannot leave (409) and stays the owner with memberCount intact", async () => {
    const owner = await createUser("oowner");
    const community = await createCommunity(owner.id, "ownerstays");
    getServerSession.mockResolvedValue(sessionFor(owner.id));

    const res = await callLeave(community.id);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("OWNER_CANNOT_LEAVE");
    expect(body.error).toBe(OWNER_CANNOT_LEAVE_MESSAGE);

    const after = await (await callDetail(community.id)).json();
    expect(after.myRole).toBe("OWNER");
    expect(after.isMember).toBe(true);
    expect(after.community.memberCount).toBe(1);
    expect(after.canDelete).toBe(true);
    expect(await prisma.communityMember.count({ where: { communityId: community.id } })).toBe(1);
  });

  it("delete: signed out is 401, a MEMBER is 403, a non-member is 403 - and the row survives", async () => {
    const owner = await createUser("downer");
    const member = await createUser("dmember");
    const stranger = await createUser("dstranger");
    const community = await createCommunity(owner.id, "undeletable");

    getServerSession.mockResolvedValue(sessionFor(member.id));
    await callJoin(community.id);

    getServerSession.mockResolvedValue(null);
    expect((await callDelete(community.id)).status).toBe(401);

    getServerSession.mockResolvedValue(sessionFor(member.id));
    expect((await callDelete(community.id)).status).toBe(403);
    expect((await (await callDetail(community.id)).json()).canDelete).toBe(false);

    getServerSession.mockResolvedValue(sessionFor(stranger.id));
    expect((await callDelete(community.id)).status).toBe(403);

    expect(await prisma.community.findUnique({ where: { id: community.id } })).not.toBeNull();
    expect(await prisma.communityMember.count({ where: { communityId: community.id } })).toBe(2);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("the OWNER can delete; membership rows cascade and the detail route then 404s", async () => {
    const owner = await createUser("cowner");
    const member = await createUser("cmember");
    const community = await createCommunity(owner.id, "cascades");
    getServerSession.mockResolvedValue(sessionFor(member.id));
    await callJoin(community.id);

    getServerSession.mockResolvedValue(sessionFor(owner.id));
    const res = await callDelete(community.id);
    expect(res.status).toBe(200);

    expect(await prisma.community.findUnique({ where: { id: community.id } })).toBeNull();
    expect(await prisma.communityMember.count({ where: { communityId: community.id } })).toBe(0);
    expect((await callDetail(community.id)).status).toBe(404);
    // An owner deleting their own community is not an admin action.
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("a site admin who is not a member can delete, and it is audit-logged", async () => {
    const owner = await createUser("aowner");
    const admin = await createUser("aadmin", { role: "ADMIN", isAdmin: true });
    const community = await createCommunity(owner.id, "adminwipes");

    getServerSession.mockResolvedValue(sessionFor(admin.id));
    expect((await (await callDetail(community.id)).json()).canDelete).toBe(true);
    const res = await callDelete(community.id);
    expect(res.status).toBe(200);
    expect(await prisma.community.findUnique({ where: { id: community.id } })).toBeNull();
    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction.mock.calls[0][0]).toMatchObject({ action: "community.delete", targetId: community.id });
  });
});
