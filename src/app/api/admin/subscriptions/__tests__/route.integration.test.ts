import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin }));

import { prisma } from "@/lib/db";
import { GET as listGET } from "../route";
import { GET as detailGET } from "../[userId]/route";
import { POST as grantPOST } from "../[userId]/grant/route";
import { POST as cancelPOST } from "../[userId]/cancel/route";
import { POST as restorePOST } from "../[userId]/restore/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function unauthorized() {
  return {
    authorized: false as const,
    response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as any,
  };
}

function authorized() {
  return {
    authorized: true as const,
    session: { user: { id: "admin-1", isAdmin: true, username: "admin1" } } as any,
  };
}

describe.skipIf(!hasRealDatabaseUrl)("Admin subscriptions & billing routes (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  beforeAll(() => {
    requireAdmin.mockResolvedValue(authorized());
  });

  afterAll(async () => {
    await prisma.subscriptionEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscriptionPayment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { targetId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: { email: `${label}-${suffix}@adminsubtest.example`, username: `${label}${suffix}`.slice(0, 20), password: "x", plan: "free" },
    });
    userIds.push(user.id);
    return user;
  }

  it("rejects every route for a non-admin", async () => {
    requireAdmin.mockResolvedValueOnce(unauthorized());
    const listRes = await listGET(new NextRequest("https://zrp.one/api/admin/subscriptions"));
    expect(listRes.status).toBe(403);

    requireAdmin.mockResolvedValueOnce(unauthorized());
    const grantRes = await grantPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/grant", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ userId: "x" }) }
    );
    expect(grantRes.status).toBe(403);
  });

  it("admin grant creates a Subscription, shows up in the list and detail routes, and is audited", async () => {
    const user = await createUser("grantee");

    const grantRes = await grantPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/grant", {
        method: "POST",
        body: JSON.stringify({ plan: "pro", billingInterval: "monthly" }),
      }),
      { params: Promise.resolve({ userId: user.id }) }
    );
    expect(grantRes.status).toBe(200);

    const detailRes = await detailGET(new NextRequest("https://zrp.one/api/admin/subscriptions/x"), {
      params: Promise.resolve({ userId: user.id }),
    });
    const detail = await detailRes.json();
    expect(detail.subscription.plan).toBe("pro");
    expect(detail.subscription.status).toBe("ACTIVE");
    expect(detail.subscription.payments).toHaveLength(1);
    expect(detail.subscription.payments[0].paymentMethod).toBe("admin_grant");

    const auditRows = await prisma.auditLog.findMany({ where: { targetId: user.id, action: "subscription.grant" } });
    expect(auditRows).toHaveLength(1);

    const listRes = await listGET(new NextRequest(`https://zrp.one/api/admin/subscriptions?search=${user.username}`));
    const list = await listRes.json();
    expect(list.subscriptions.some((s: { userId: string }) => s.userId === user.id)).toBe(true);
  });

  it("admin cancel then restore round-trips and is audited both ways", async () => {
    const user = await createUser("cancelee");
    await grantPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/grant", {
        method: "POST",
        body: JSON.stringify({ plan: "business", billingInterval: "monthly" }),
      }),
      { params: Promise.resolve({ userId: user.id }) }
    );

    const cancelRes = await cancelPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/cancel", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ userId: user.id }) }
    );
    expect(cancelRes.status).toBe(200);
    let dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.plan).toBe("free");

    // Canceling again is a safe no-op (409), never a second cancellation event.
    const secondCancel = await cancelPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/cancel", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ userId: user.id }) }
    );
    expect(secondCancel.status).toBe(409);

    const restoreRes = await restorePOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/restore", { method: "POST" }),
      { params: Promise.resolve({ userId: user.id }) }
    );
    expect(restoreRes.status).toBe(200);
    dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.plan).toBe("business");

    const events = await prisma.subscriptionEvent.findMany({ where: { userId: user.id, action: "subscription_canceled" } });
    expect(events).toHaveLength(1);
  });

  it("rejects an invalid plan on grant (server-side validation, not trusting client input)", async () => {
    const user = await createUser("badplan");
    const res = await grantPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/grant", {
        method: "POST",
        body: JSON.stringify({ plan: "super-ultra-plan" }),
      }),
      { params: Promise.resolve({ userId: user.id }) }
    );
    expect(res.status).toBe(400);
  });
});
