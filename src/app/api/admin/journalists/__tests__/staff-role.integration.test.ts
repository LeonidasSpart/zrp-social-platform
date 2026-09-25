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
import { POST as grant } from "../route";
import { PATCH } from "../[id]/route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

/*
 * The journalist routes are staff-level (moderators included) and write
 * User.role. They must never overwrite an ADMIN/MODERATOR role - that
 * let a moderator demote an admin just by granting/removing journalist
 * status on their account.
 */
describe.skipIf(!hasRealDatabaseUrl)("admin journalist routes never touch a staff role (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    for (const [label, role] of [
      ["admin", "ADMIN"],
      ["mod", "MODERATOR"],
      ["actor", "MODERATOR"],
    ] as const) {
      const u = await prisma.user.create({
        data: { email: `${label}-${suffix}@journrole.example`, username: `jr${label}${suffix}`, password: "x", role },
      });
      ids[label] = u.id;
    }
    requireStaff.mockResolvedValue({ authorized: true, session: { user: { id: ids.actor, username: "mod" } } });
    // A moderator who once applied as a journalist.
    await prisma.journalistProfile.create({ data: { userId: ids.mod, status: "PENDING" } });
  });

  afterAll(async () => {
    await prisma.journalistProfile.deleteMany({ where: { userId: { in: Object.values(ids) } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  });

  it("refuses to grant journalist status to an admin (would strip ADMIN)", async () => {
    const res = await grant(
      new NextRequest("https://zrp.one/api/admin/journalists", {
        method: "POST",
        body: JSON.stringify({ userId: ids.admin }),
      })
    );
    expect(res.status).toBe(409);
    expect((await prisma.user.findUnique({ where: { id: ids.admin } }))?.role).toBe("ADMIN");
  });

  it("refuses to approve a staff member's application", async () => {
    const res = await PATCH(
      new NextRequest(`https://zrp.one/api/admin/journalists/${ids.mod}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      }),
      { params: Promise.resolve({ id: ids.mod }) }
    );
    expect(res.status).toBe(409);
    expect((await prisma.user.findUnique({ where: { id: ids.mod } }))?.role).toBe("MODERATOR");
  });

  it("removing a staff member's application leaves their staff role alone", async () => {
    const res = await PATCH(
      new NextRequest(`https://zrp.one/api/admin/journalists/${ids.mod}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "remove" }),
      }),
      { params: Promise.resolve({ id: ids.mod }) }
    );
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: ids.mod } }))?.role).toBe("MODERATOR");
    expect((await prisma.journalistProfile.findUnique({ where: { userId: ids.mod } }))?.status).toBe("REJECTED");
  });
});
