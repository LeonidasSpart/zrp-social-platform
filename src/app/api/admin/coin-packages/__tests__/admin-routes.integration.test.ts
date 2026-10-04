import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, requireAdmin };
});

import { prisma } from "@/lib/db";
import { GET as listRoute, POST as createRoute } from "../route";
import { PATCH as patchRoute } from "../[id]/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function jsonReq(url: string, body?: unknown, method = "POST") {
  return new NextRequest(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function asAdmin(adminId = "admin-stub") {
  requireAdmin.mockResolvedValue({
    authorized: true,
    session: { user: { id: adminId, username: "admin" } },
  });
}

function asUnauthorized() {
  const response = new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  requireAdmin.mockResolvedValue({ authorized: false, response });
}

describe.skipIf(!hasRealDatabaseUrl)("Admin Coin Packages routes (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const packageKeys: string[] = [];

  afterAll(async () => {
    await prisma.coinPackage.deleteMany({ where: { key: { in: packageKeys } } });
  });

  it("rejects every route when requireAdmin says unauthorized", async () => {
    asUnauthorized();
    const res1 = await createRoute(jsonReq("https://zrp.one/api/admin/coin-packages", { key: "x", priceUsdc: 1, coinsCredited: 100 }));
    expect(res1.status).toBe(403);

    const res2 = await listRoute();
    expect(res2.status).toBe(403);
  });

  it("validates key format, price, coinsCredited and bonusCoins on creation", async () => {
    asAdmin();
    const badKey = await createRoute(
      jsonReq("https://zrp.one/api/admin/coin-packages", { key: "Not Valid!", priceUsdc: 5, coinsCredited: 500 })
    );
    expect(badKey.status).toBe(400);

    const badPrice = await createRoute(
      jsonReq("https://zrp.one/api/admin/coin-packages", { key: `pkg-${suffix}-a`, priceUsdc: 0, coinsCredited: 500 })
    );
    expect(badPrice.status).toBe(400);

    const badCoins = await createRoute(
      jsonReq("https://zrp.one/api/admin/coin-packages", { key: `pkg-${suffix}-b`, priceUsdc: 5, coinsCredited: 0 })
    );
    expect(badCoins.status).toBe(400);

    const badBonus = await createRoute(
      jsonReq("https://zrp.one/api/admin/coin-packages", { key: `pkg-${suffix}-c`, priceUsdc: 5, coinsCredited: 500, bonusCoins: -10 })
    );
    expect(badBonus.status).toBe(400);
  });

  it("creates a package, rejects a duplicate key, enables/disables and reprices it via PATCH (never DELETE)", async () => {
    asAdmin();
    const key = `pkg-${suffix}-dup`;
    packageKeys.push(key);
    const created = await createRoute(
      jsonReq("https://zrp.one/api/admin/coin-packages", { key, priceUsdc: 4.99, coinsCredited: 500, bonusCoins: 50 })
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.package.key).toBe(key);
    expect(Number(createdBody.package.priceUsdc)).toBeCloseTo(4.99, 2);

    const dup = await createRoute(
      jsonReq("https://zrp.one/api/admin/coin-packages", { key, priceUsdc: 4.99, coinsCredited: 500 })
    );
    expect(dup.status).toBe(409);

    const disabled = await patchRoute(
      jsonReq(`https://zrp.one/api/admin/coin-packages/${createdBody.package.id}`, { enabled: false }, "PATCH"),
      { params: Promise.resolve({ id: createdBody.package.id }) }
    );
    expect(disabled.status).toBe(200);
    const disabledBody = await disabled.json();
    expect(disabledBody.package.enabled).toBe(false);

    const repriced = await patchRoute(
      jsonReq(`https://zrp.one/api/admin/coin-packages/${createdBody.package.id}`, { priceUsdc: 9.99, coinsCredited: 1100 }, "PATCH"),
      { params: Promise.resolve({ id: createdBody.package.id }) }
    );
    expect(repriced.status).toBe(200);
    const repricedBody = await repriced.json();
    expect(Number(repricedBody.package.priceUsdc)).toBeCloseTo(9.99, 2);
    expect(repricedBody.package.coinsCredited).toBe(1100);
  });

  it("reorders two packages by swapping sortOrder", async () => {
    asAdmin();
    const keyA = `pkg-${suffix}-sort-a`;
    const keyB = `pkg-${suffix}-sort-b`;
    packageKeys.push(keyA, keyB);

    const resA = await createRoute(
      jsonReq("https://zrp.one/api/admin/coin-packages", { key: keyA, priceUsdc: 1, coinsCredited: 100, sortOrder: 0 })
    );
    const resB = await createRoute(
      jsonReq("https://zrp.one/api/admin/coin-packages", { key: keyB, priceUsdc: 2, coinsCredited: 200, sortOrder: 1 })
    );
    const { package: pkgA } = await resA.json();
    const { package: pkgB } = await resB.json();

    await patchRoute(jsonReq(`https://zrp.one/api/admin/coin-packages/${pkgA.id}`, { sortOrder: 1 }, "PATCH"), {
      params: Promise.resolve({ id: pkgA.id }),
    });
    await patchRoute(jsonReq(`https://zrp.one/api/admin/coin-packages/${pkgB.id}`, { sortOrder: 0 }, "PATCH"), {
      params: Promise.resolve({ id: pkgB.id }),
    });

    const refreshedA = await prisma.coinPackage.findUniqueOrThrow({ where: { id: pkgA.id } });
    const refreshedB = await prisma.coinPackage.findUniqueOrThrow({ where: { id: pkgB.id } });
    expect(refreshedA.sortOrder).toBe(1);
    expect(refreshedB.sortOrder).toBe(0);
  });

  it("lists the full catalog including disabled packages via GET", async () => {
    asAdmin();
    const key = `pkg-${suffix}-list`;
    packageKeys.push(key);
    await createRoute(jsonReq("https://zrp.one/api/admin/coin-packages", { key, priceUsdc: 1, coinsCredited: 100, enabled: false }));

    const res = await listRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packages.some((p: { key: string; enabled: boolean }) => p.key === key && p.enabled === false)).toBe(true);
  });
});
