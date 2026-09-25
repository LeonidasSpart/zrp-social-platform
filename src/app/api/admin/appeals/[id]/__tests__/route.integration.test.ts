import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireStaff, logAdminAction, createNotification } = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  logAdminAction: vi.fn(),
  createNotification: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireStaff }));
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
