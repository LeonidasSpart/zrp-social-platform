import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireStaff, logAdminAction } = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireStaff }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { PUT } from "../route";

/*
 * When a bare profile report (reportedUserId set, no post/comment/
 * listing/etc.) is actioned, targetUserId - the field the appeals flow
 * and moderation transparency dashboard both key off - must be
 * denormalized from reportedUserId, exactly like it already is from
 * post.authorId/comment.authorId/etc. for every other polymorphic
 * target. Before this, a profile report actioned here would leave
 * targetUserId null, making the action untraceable and unappealable.
 */
const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function put(id: string, body: unknown) {
  return PUT(
    new NextRequest(`https://zrp.one/api/admin/reports/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe.skipIf(!hasRealDatabaseUrl)("PUT /api/admin/reports/[id] - profile reports (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const reportIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@profilereportactiontest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  beforeEach(() => {
    requireStaff.mockReset();
    logAdminAction.mockReset();
    requireStaff.mockResolvedValue({
      authorized: true,
      session: { user: { id: "admin-1", username: "admin" } },
    });
  });

  afterAll(async () => {
    await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("denormalizes targetUserId from reportedUserId when a bare profile report is actioned", async () => {
    const reporter = await createUser("reporter");
    const reported = await createUser("reported");

    const report = await prisma.report.create({
      data: { reporterId: reporter.id, reportedUserId: reported.id, reason: "Harassment or bullying", status: "pending" },
    });
    reportIds.push(report.id);

    const res = await put(report.id, { status: "actioned", actionType: "WARN_USER", actionNote: "First warning." });
    expect(res.status).toBe(200);

    const updated = await prisma.report.findUnique({ where: { id: report.id } });
    expect(updated?.targetUserId).toBe(reported.id);
    expect(updated?.status).toBe("actioned");
    expect(updated?.actionedAt).not.toBeNull();
  });
});
