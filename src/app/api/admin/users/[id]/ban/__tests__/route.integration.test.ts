import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireStaff, logAdminAction } = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireStaff }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { POST } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function ban(actorId: string, targetId: string, body?: unknown) {
  requireStaff.mockResolvedValue({ authorized: true, session: { user: { id: actorId, username: "actor" } } });
  return POST(
    new NextRequest(`https://zrp.one/api/admin/users/${targetId}/ban`, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    { params: Promise.resolve({ id: targetId }) }
  );
}

/*
 * The ban route is staff-level (moderators included). A banned account
 * fails every admin check, so without a target-role guard any moderator
 * could lock every admin out of the platform.
 */
describe.skipIf(!hasRealDatabaseUrl)("POST /api/admin/users/[id]/ban (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    for (const [label, role] of [
      ["admin", "ADMIN"],
      ["mod", "MODERATOR"],
      ["mod2", "MODERATOR"],
      ["user", "USER"],
    ] as const) {
      const u = await prisma.user.create({
        data: { email: `${label}-${suffix}@bantest.example`, username: `ban${label}${suffix}`, password: "x", role },
      });
      ids[label] = u.id;
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  });

  it("a moderator cannot ban an admin", async () => {
    const res = await ban(ids.mod, ids.admin);
    expect(res.status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id: ids.admin } }))?.banned).toBe(false);
  });

  it("a moderator cannot ban another moderator", async () => {
    const res = await ban(ids.mod, ids.mod2);
    expect(res.status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id: ids.mod2 } }))?.banned).toBe(false);
  });

  it("nobody can ban themselves", async () => {
    const res = await ban(ids.admin, ids.admin);
    expect(res.status).toBe(400);
  });

  it("an explicit target state is idempotent (a double-submit can't flip the ban back off)", async () => {
    expect((await ban(ids.mod, ids.user, { banned: true })).status).toBe(200);
    const second = await ban(ids.mod, ids.user, { banned: true });
    expect(second.status).toBe(200);
    expect((await second.json()).banned).toBe(true);
    expect((await prisma.user.findUnique({ where: { id: ids.user } }))?.banned).toBe(true);
  });

  it("an admin can still ban a moderator", async () => {
    const res = await ban(ids.admin, ids.mod2, { banned: true });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: ids.mod2 } }))?.banned).toBe(true);
  });
});
