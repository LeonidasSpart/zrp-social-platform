import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireStaff, logAdminAction } = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireStaff }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { DELETE } from "../route";

/*
 * Regression coverage for the missing Admin > Reports deletion
 * capability: PUT (status transitions) already existed on this route,
 * but there was no DELETE at all, and the admin UI only ever rendered
 * action buttons for status === "pending" - so a reviewed, dismissed or
 * actioned report had no control to remove it, ever.
 *
 * Uses a real Postgres (see CLAUDE.md: *.integration.test.ts skips
 * itself without DATABASE_URL) because the interesting behaviour here
 * is genuine database state: the row actually being gone afterward, and
 * - the part a mocked Prisma client could never catch - the real
 * Appeal.reportId onDelete: Cascade in schema.prisma actually firing if
 * this route didn't guard against it.
 */
const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(id: string) {
  return DELETE(new NextRequest(`https://zrp.one/api/admin/reports/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe.skipIf(!hasRealDatabaseUrl)("DELETE /api/admin/reports/[id] (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const reportIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@reportdeltest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createReport(reporterId: string, status: string) {
    const report = await prisma.report.create({
      data: { reporterId, reason: "spam", status },
    });
    reportIds.push(report.id);
    return report;
  }

  let reporter: { id: string };

  beforeAll(async () => {
    reporter = await createUser("reporter");
  });

  beforeEach(() => {
    requireStaff.mockReset();
    logAdminAction.mockReset();
    // Every test that reaches the handler's own logic is an authorized
    // moderator by default; the two auth tests below override this.
    requireStaff.mockResolvedValue({
      authorized: true,
      session: { user: { id: "mod-1", username: "moderator" } },
    });
  });

  afterAll(async () => {
    await prisma.appeal.deleteMany({ where: { reportId: { in: reportIds } } });
    await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("returns 401 when the caller is not authenticated", async () => {
    requireStaff.mockResolvedValueOnce({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) as any,
    });
    const report = await createReport(reporter.id, "reviewed");

    const res = await call(report.id);

    expect(res.status).toBe(401);
    // The row must genuinely survive a rejected request, not just the
    // response code claiming it does.
    expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
  });

  it("returns 403 when the caller is authenticated but not staff (a normal user)", async () => {
    requireStaff.mockResolvedValueOnce({
      authorized: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) as any,
    });
    const report = await createReport(reporter.id, "reviewed");

    const res = await call(report.id);

    expect(res.status).toBe(403);
    expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
  });

  it("deletes an eligible reviewed report and removes it from the database", async () => {
    const report = await createReport(reporter.id, "reviewed");

    const res = await call(report.id);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(await prisma.report.findUnique({ where: { id: report.id } })).toBeNull();
  });

  it("deletes a dismissed report", async () => {
    const report = await createReport(reporter.id, "dismissed");
    const res = await call(report.id);
    expect(res.status).toBe(200);
    expect(await prisma.report.findUnique({ where: { id: report.id } })).toBeNull();
  });

  it("deletes an actioned report", async () => {
    const report = await createReport(reporter.id, "actioned");
    const res = await call(report.id);
    expect(res.status).toBe(200);
    expect(await prisma.report.findUnique({ where: { id: report.id } })).toBeNull();
  });

  it("refuses to delete a pending report, and the report survives", async () => {
    const report = await createReport(reporter.id, "pending");

    const res = await call(report.id);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBeTruthy();
    expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
  });

  it("returns 404 for a nonexistent (but well-formed) report id", async () => {
    const res = await call(`nonexistent-${randomUUID()}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 rather than 500 for a malformed/invalid report id", async () => {
    const res = await call("not-a-real-id-at-all-###");
    expect(res.status).toBe(404);
  });

  it("refuses to delete a report that has an appeal on file, and neither row is destroyed", async () => {
    // This is the case a naive `prisma.report.delete()` would get wrong:
    // Appeal.reportId is onDelete: Cascade in schema.prisma, so without
    // this guard, deleting the report would silently take the appeal
    // record - the moderation-transparency audit trail - down with it.
    const report = await createReport(reporter.id, "actioned");
    const appellant = await createUser("appellant");
    await prisma.appeal.create({
      data: { reportId: report.id, userId: appellant.id, message: "I did not do this." },
    });

    const res = await call(report.id);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBeTruthy();
    expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
    expect(await prisma.appeal.findFirst({ where: { reportId: report.id } })).not.toBeNull();
  });

  it("logs the deletion to the admin audit log with the report's own detail, since the row itself is gone afterward", async () => {
    const report = await createReport(reporter.id, "actioned");

    await call(report.id);

    expect(logAdminAction).toHaveBeenCalledTimes(1);
    const [args] = logAdminAction.mock.calls[0];
    expect(args.action).toBe("report.delete");
    expect(args.targetType).toBe("Report");
    expect(args.targetId).toBe(report.id);
    expect(args.metadata).toMatchObject({ reason: "spam", status: "actioned" });
  });

  it("does not call the audit log when deletion is refused", async () => {
    const report = await createReport(reporter.id, "pending");
    await call(report.id);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
