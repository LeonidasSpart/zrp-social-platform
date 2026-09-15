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

  // ─── Dashboard root-cause regression: users with no Subscription row ──
  // must still be searchable/filterable/countable. Before the fix, the
  // list route queried `Subscription` as its base table, so a free user
  // (never has a Subscription row) or a legacy-paid user (paid per
  // User.plan, never backfilled) was invisible to search and every filter
  // no matter how real they were - see route.ts's top comment.

  it("a plain free user (no Subscription row) is found by search and counted correctly", async () => {
    const user = await createUser("plainfree");

    const listRes = await listGET(new NextRequest(`https://zrp.one/api/admin/subscriptions?search=${user.username}`));
    const list = await listRes.json();
    const found = list.subscriptions.find((s: { userId: string }) => s.userId === user.id);
    expect(found).toBeTruthy();
    expect(found.status).toBe("FREE");
    expect(found.id).toBeNull();
  });

  it("a legacy-paid user with no Subscription row shows up under NO_SUBSCRIPTION, not FREE", async () => {
    const user = await prisma.user.create({
      data: { email: `legacy-${suffix}@adminsubtest.example`, username: `legacy${suffix}`.slice(0, 20), password: "x", plan: "business" },
    });
    userIds.push(user.id);

    const noSubRes = await listGET(new NextRequest("https://zrp.one/api/admin/subscriptions?status=NO_SUBSCRIPTION"));
    const noSubList = await noSubRes.json();
    const found = noSubList.subscriptions.find((s: { userId: string }) => s.userId === user.id);
    expect(found).toBeTruthy();
    expect(found.status).toBe("NO_SUBSCRIPTION");
    expect(found.needsReconciliation).toBe(true);

    // Must never be misclassified as genuinely free - they still have
    // full plan access via User.plan (see CLAUDE.md "source of truth").
    const freeRes = await listGET(new NextRequest("https://zrp.one/api/admin/subscriptions?status=FREE"));
    const freeList = await freeRes.json();
    expect(freeList.subscriptions.some((s: { userId: string }) => s.userId === user.id)).toBe(false);

    const overview = noSubList.overview;
    expect(overview.needsReconciliation).toBeGreaterThanOrEqual(1);
  });

  it("Business plan filter finds a legacy business-plan user even with no Subscription row", async () => {
    const user = await prisma.user.create({
      data: { email: `legacybiz-${suffix}@adminsubtest.example`, username: `legacybiz${suffix}`.slice(0, 20), password: "x", plan: "business" },
    });
    userIds.push(user.id);

    const res = await listGET(new NextRequest("https://zrp.one/api/admin/subscriptions?plan=business"));
    const list = await res.json();
    expect(list.subscriptions.some((s: { userId: string }) => s.userId === user.id)).toBe(true);
  });

  // ─── KPI / list count consistency (the dashboard's own acceptance test) ──

  // Each of these fetches overview + the matching filtered list in a
  // SINGLE request (exactly like the dashboard's own page load), so the
  // comparison can't race against other integration test files mutating
  // the same shared Postgres between two separate calls.

  it("PAID KPI count equals the total returned by filtering to status=PAID", async () => {
    await createUser("paidcount1");
    const paidUser = await prisma.user.create({
      data: { email: `paidcount2-${suffix}@adminsubtest.example`, username: `paidcount2${suffix}`.slice(0, 20), password: "x", plan: "pro" },
    });
    userIds.push(paidUser.id);

    const res = await listGET(new NextRequest("https://zrp.one/api/admin/subscriptions?status=PAID&limit=100"));
    const data = await res.json();
    expect(data.pagination.total).toBe(data.overview.paidUsers);
  });

  it("FREE KPI count equals the total returned by filtering to status=FREE", async () => {
    const res = await listGET(new NextRequest("https://zrp.one/api/admin/subscriptions?status=FREE&limit=100"));
    const data = await res.json();
    expect(data.pagination.total).toBe(data.overview.freeUsers);
  });

  it("ACTIVE KPI count equals the total returned by filtering to status=ACTIVE", async () => {
    const user = await createUser("activecount");
    await grantPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/grant", {
        method: "POST",
        body: JSON.stringify({ plan: "pro", billingInterval: "monthly" }),
      }),
      { params: Promise.resolve({ userId: user.id }) }
    );

    const res = await listGET(new NextRequest("https://zrp.one/api/admin/subscriptions?status=ACTIVE&limit=100"));
    const data = await res.json();
    expect(data.pagination.total).toBe(data.overview.active);
    expect(data.subscriptions.some((s: { userId: string }) => s.userId === user.id)).toBe(true);
  });

  // ─── Combined filters must AND together, never overwrite each other ──

  it("combining plan + status + search applies every constraint simultaneously", async () => {
    const target = await createUser("combofind");
    await grantPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/grant", {
        method: "POST",
        body: JSON.stringify({ plan: "business", billingInterval: "yearly" }),
      }),
      { params: Promise.resolve({ userId: target.id }) }
    );
    // A decoy on the same plan but a different status must be excluded.
    const decoy = await createUser("combodecoy");
    await grantPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/grant", {
        method: "POST",
        body: JSON.stringify({ plan: "business", billingInterval: "monthly" }),
      }),
      { params: Promise.resolve({ userId: decoy.id }) }
    );
    await cancelPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/cancel", { method: "POST", body: "{}" }),
      { params: Promise.resolve({ userId: decoy.id }) }
    );

    const res = await listGET(
      new NextRequest(`https://zrp.one/api/admin/subscriptions?plan=business&status=ACTIVE&search=combo`)
    );
    const list = await res.json();
    const ids = list.subscriptions.map((s: { userId: string }) => s.userId);
    expect(ids).toContain(target.id);
    expect(ids).not.toContain(decoy.id);
  });

  // ─── Empty result vs. API failure must be distinguishable ──

  it("an empty result set for a query with zero matches is still a 200 with an empty array, not an error", async () => {
    const res = await listGET(
      new NextRequest(`https://zrp.one/api/admin/subscriptions?search=definitely-nonexistent-${suffix}`)
    );
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.subscriptions).toEqual([]);
    expect(list.pagination.total).toBe(0);
  });

  it("expiringWithin=30 only returns subscriptions whose period actually ends within 30 days", async () => {
    const soon = await createUser("expiringsoon");
    await grantPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/grant", { method: "POST", body: JSON.stringify({ plan: "pro", billingInterval: "monthly" }) }),
      { params: Promise.resolve({ userId: soon.id }) }
    );
    const farOut = await createUser("expiringfar");
    await grantPOST(
      new NextRequest("https://zrp.one/api/admin/subscriptions/x/grant", { method: "POST", body: JSON.stringify({ plan: "pro", billingInterval: "yearly" }) }),
      { params: Promise.resolve({ userId: farOut.id }) }
    );

    const res = await listGET(new NextRequest("https://zrp.one/api/admin/subscriptions?expiringWithin=30&limit=200"));
    const list = await res.json();
    const ids = list.subscriptions.map((s: { userId: string }) => s.userId);
    expect(ids).toContain(soon.id);
    expect(ids).not.toContain(farOut.id);
    for (const row of list.subscriptions) {
      expect(new Date(row.currentPeriodEnd).getTime()).toBeLessThanOrEqual(Date.now() + 30 * 86400000);
    }
  });
});
