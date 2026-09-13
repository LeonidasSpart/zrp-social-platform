import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST as join } from "../[id]/join/route";
import { POST as leave } from "../[id]/leave/route";
import { GET as detail } from "../[id]/route";
import { POST as createCommunity } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

function callJoin(id: string) {
  return join(
    new NextRequest(`https://zrp.one/api/communities/${id}/join`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );
}
function callLeave(id: string) {
  return leave(
    new NextRequest(`https://zrp.one/api/communities/${id}/leave`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );
}
function callDetail(id: string) {
  return detail(new NextRequest(`https://zrp.one/api/communities/${id}`), {
    params: Promise.resolve({ id }),
  });
}

// Communities are a brand-new, real (schema-backed) feature - this
// covers the two things a fake/UI-only "Join" button could otherwise
// get away with: memberCount must reflect real membership rows, not
// drift from double-joins or double-leaves, and every write must be
// authenticated.
describe.skipIf(!hasRealDatabaseUrl)("Community join/leave (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const communityIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: { email: `${label}-${suffix}@communitytest.example`, username: `${label}${suffix}`.slice(0, 20), password: "x" },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.communityMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getServerSession.mockReset();
  });

  it("rejects an unauthenticated join", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await callJoin("does-not-matter");
    expect(res.status).toBe(401);
  });

  it("creating a community auto-joins the creator as OWNER with memberCount 1", async () => {
    const owner = await createUser("owner");
    getServerSession.mockResolvedValueOnce(sessionFor(owner.id));

    const res = await createCommunity(
      new NextRequest("https://zrp.one/api/communities", {
        method: "POST",
        body: JSON.stringify({
          name: `Test Travel ${suffix}`,
          description: "A community for people who love to travel the world.",
          category: "TRAVEL",
          hashtag: `travel${suffix}`,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    communityIds.push(body.community.id);
    expect(body.community.memberCount).toBe(1);
    expect(body.myRole).toBe("OWNER");
  });

  it("a second user joining increments memberCount exactly once, and re-joining is a no-op", async () => {
    const communityId = communityIds[0];
    const member = await createUser("member");
    getServerSession.mockResolvedValue(sessionFor(member.id));

    const first = await callJoin(communityId);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.alreadyMember).toBe(false);

    const second = await callJoin(communityId);
    const secondBody = await second.json();
    expect(secondBody.alreadyMember).toBe(true);

    const detailRes = await callDetail(communityId);
    const detailBody = await detailRes.json();
    expect(detailBody.community.memberCount).toBe(2);
    expect(detailBody.isMember).toBe(true);
  });

  it("leaving decrements memberCount exactly once, and leaving again is a no-op", async () => {
    const communityId = communityIds[0];
    const member = userIds[1];
    getServerSession.mockResolvedValue(sessionFor(member));

    const first = await callLeave(communityId);
    expect(first.status).toBe(200);

    const second = await callLeave(communityId);
    expect(second.status).toBe(200);

    const detailRes = await callDetail(communityId);
    const detailBody = await detailRes.json();
    expect(detailBody.community.memberCount).toBe(1);
  });
});
