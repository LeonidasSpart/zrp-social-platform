import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireStaff, logAdminAction, createNotification } = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  logAdminAction: vi.fn(),
  createNotification: vi.fn(),
}));
// Only requireStaff is faked - requireAdminToModifyStaffBan (the same
// moderator-can't-touch-staff guard also used by admin/users/[id]/ban)
// must run for real against real DB rows in this real-Postgres test.
vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, requireStaff };
});
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));
vi.mock("@/lib/notifications", () => ({ createNotification }));

import { prisma } from "@/lib/db";
import { PUT } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

/*
 * Two staff resolving the same appeal at once used to both pass the
 * "still pending" read, so one could record "upheld" while the other
 * unbanned the user as "overturned", and the user got notified twice.
 */
describe.skipIf(!hasRealDatabaseUrl)("PUT /api/admin/appeals/[id] (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  let appealId = "";
  let reportId = "";

  beforeAll(async () => {
    requireStaff.mockResolvedValue({ authorized: true, session: { user: { id: "staff-1", username: "staff" } } });
    const reporter = await prisma.user.create({
      data: { email: `r-${suffix}@appealrace.example`, username: `arr${suffix}`, password: "x" },
    });
    const target = await prisma.user.create({
      data: { email: `t-${suffix}@appealrace.example`, username: `art${suffix}`, password: "x", banned: true },
    });
    userIds.push(reporter.id, target.id);
    const report = await prisma.report.create({
      data: {
        reporterId: reporter.id,
        reportedUserId: target.id,
        targetUserId: target.id,
        reason: "Spam",
        status: "actioned",
        actionType: "BAN_USER",
        actionedAt: new Date(),
      },
    });
    reportId = report.id;
    const appeal = await prisma.appeal.create({ data: { reportId, userId: target.id, message: "Please" } });
    appealId = appeal.id;
  });

  afterAll(async () => {
    await prisma.report.deleteMany({ where: { id: reportId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  const put = (status: string) =>
    PUT(
      new NextRequest(`https://zrp.one/api/admin/appeals/${appealId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
      { params: Promise.resolve({ id: appealId }) }
    );

  it("lets exactly one of two concurrent resolutions win", async () => {
    const results = await Promise.all([put("upheld"), put("overturned")]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);

    const winner = results.find((r) => r.status === 200)!;
    const stored = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId } });
    expect(stored.status).toBe((await winner.json()).status);

    // The ban state agrees with whichever decision actually won.
    const target = await prisma.user.findUniqueOrThrow({ where: { id: userIds[1] } });
    expect(target.banned).toBe(stored.status === "upheld");
    expect(createNotification).toHaveBeenCalledTimes(1);
  });
});

/*
 * ⚠️ REGRESSION (master audit): overturning a BAN_USER appeal unbans the
 * target the same way POST /api/admin/users/[id]/ban does - without the
 * same staff-role guard, a moderator could unban another moderator or an
 * admin by appeal instead of by the ban route directly.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "PUT /api/admin/appeals/[id] moderator-cannot-touch-staff guard",
  () => {
    const suffix = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    let appealId = "";
    let reportId = "";

    beforeAll(async () => {
      requireStaff.mockResolvedValue({ authorized: true, session: { user: { id: "mod-1", username: "mod" } } });
      const reporter = await prisma.user.create({
        data: { email: `r2-${suffix}@appealstaff.example`, username: `asr${suffix}`, password: "x" },
      });
      // The appealing target is a moderator - banned by an earlier admin action.
      const target = await prisma.user.create({
        data: { email: `t2-${suffix}@appealstaff.example`, username: `ast${suffix}`, password: "x", role: "MODERATOR", banned: true },
      });
      userIds.push(reporter.id, target.id);
      const report = await prisma.report.create({
        data: {
          reporterId: reporter.id,
          reportedUserId: target.id,
          targetUserId: target.id,
          reason: "Spam",
          status: "actioned",
          actionType: "BAN_USER",
          actionedAt: new Date(),
        },
      });
      reportId = report.id;
      const appeal = await prisma.appeal.create({ data: { reportId, userId: target.id, message: "Please" } });
      appealId = appeal.id;
    });

    afterAll(async () => {
      await prisma.report.deleteMany({ where: { id: reportId } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("a moderator cannot overturn a BAN_USER appeal against another staff account", async () => {
      const res = await PUT(
        new NextRequest(`https://zrp.one/api/admin/appeals/${appealId}`, {
          method: "PUT",
          body: JSON.stringify({ status: "overturned" }),
        }),
        { params: Promise.resolve({ id: appealId }) }
      );
      expect(res.status).toBe(403);

      const stored = await prisma.appeal.findUniqueOrThrow({ where: { id: appealId } });
      expect(stored.status).toBe("pending");
      const target = await prisma.user.findUniqueOrThrow({ where: { id: userIds[1] } });
      expect(target.banned).toBe(true);
    });
  }
);
