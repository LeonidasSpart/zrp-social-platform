import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

/*
 * Authorization-boundary coverage for DELETE /api/admin/reports/[id],
 * deliberately NOT mocking @/lib/admin - the whole point of this file is
 * to exercise the real requireStaff()/requireAdmin() -> getUserAuthState()
 * -> isModeratorState()/isAdminState() chain against real User rows in
 * Postgres, so it proves who is actually authorized rather than trusting
 * a mocked stand-in for the auth check. Only next-auth's getServerSession
 * is mocked, to select which real user is "logged in" for each request.
 *
 * Product requirement under test: ONLY ADMIN USERS MAY DELETE PROCESSED
 * REPORTS. A MODERATOR who is not also flagged ADMIN must be refused.
 */
const { getServerSession, logAdminAction } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { DELETE } from "../route";
import { __resetAuthStateCacheForTests } from "@/lib/auth-state";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(id: string) {
  return DELETE(new NextRequest(`https://zrp.one/api/admin/reports/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe.skipIf(!hasRealDatabaseUrl)(
  "DELETE /api/admin/reports/[id] - real authorization boundary (integration, real Postgres, real role checks)",
  () => {
    const suffix = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const reportIds: string[] = [];

    async function createUser(label: string, role: "USER" | "MODERATOR" | "ADMIN", isAdmin = false, banned = false) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${suffix}@reportauthztest.example`,
          username: `${label}${suffix}`.slice(0, 20),
          password: "x",
          role,
          isAdmin,
          banned,
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
    let normalUser: { id: string };
    let moderator: { id: string };
    let admin: { id: string };
    let bannedAdmin: { id: string };

    beforeAll(async () => {
      reporter = await createUser("reporter", "USER");
      normalUser = await createUser("normie", "USER");
      moderator = await createUser("mod", "MODERATOR");
      admin = await createUser("admin", "ADMIN", true);
      bannedAdmin = await createUser("bannedadmin", "ADMIN", true, true);
    });

    beforeEach(() => {
      getServerSession.mockReset();
      logAdminAction.mockReset();
      // fresh: true in requireStaff/requireAdmin bypasses the cache on
      // read, but clear it anyway so no test can be affected by a stale
      // entry a previous test wrote.
      __resetAuthStateCacheForTests();
    });

    afterAll(async () => {
      await prisma.appeal.deleteMany({ where: { reportId: { in: reportIds } } });
      await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("unauthenticated caller (no session at all): denied, report survives", async () => {
      getServerSession.mockResolvedValue(null);
      const report = await createReport(reporter.id, "actioned");

      const res = await call(report.id);

      expect(res.status).toBe(401);
      expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
    });

    it("normal authenticated user (role USER): denied, report survives", async () => {
      getServerSession.mockResolvedValue({ user: { id: normalUser.id } });
      const report = await createReport(reporter.id, "actioned");

      const res = await call(report.id);

      expect(res.status).toBe(403);
      expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
    });

    // The product requirement under test: MODERATOR (staff, not admin)
    // must NOT be able to delete a report. This is the exact claim from
    // the audit finding, proven here against the real role-check chain
    // rather than a mocked stand-in.
    it("moderator (staff, not admin): denied for DELETE, report survives", async () => {
      getServerSession.mockResolvedValue({ user: { id: moderator.id } });
      const report = await createReport(reporter.id, "actioned");

      const res = await call(report.id);

      expect(res.status).toBe(403);
      expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
      expect(logAdminAction).not.toHaveBeenCalled();
    });

    it("admin: allowed to delete an eligible (actioned) report", async () => {
      getServerSession.mockResolvedValue({ user: { id: admin.id } });
      const report = await createReport(reporter.id, "actioned");

      const res = await call(report.id);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(await prisma.report.findUnique({ where: { id: report.id } })).toBeNull();
    });

    it("banned admin: denied, per the authoritative ban model (isAdminState requires !banned)", async () => {
      getServerSession.mockResolvedValue({ user: { id: bannedAdmin.id } });
      const report = await createReport(reporter.id, "actioned");

      const res = await call(report.id);

      expect(res.status).toBe(401);
      expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
    });

    it("admin: still refused on a pending report (protected status is enforced regardless of who is asking)", async () => {
      getServerSession.mockResolvedValue({ user: { id: admin.id } });
      const report = await createReport(reporter.id, "pending");

      const res = await call(report.id);

      expect(res.status).toBe(409);
      expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
    });

    it("admin: still refused on an appealed report (appeal-protection is enforced regardless of who is asking)", async () => {
      getServerSession.mockResolvedValue({ user: { id: admin.id } });
      const report = await createReport(reporter.id, "actioned");
      const appellant = await createUser("appellant2", "USER");
      await prisma.appeal.create({
        data: { reportId: report.id, userId: appellant.id, message: "not me" },
      });

      const res = await call(report.id);

      expect(res.status).toBe(409);
      expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
      expect(await prisma.appeal.findFirst({ where: { reportId: report.id } })).not.toBeNull();
    });

    it("denial responses leak no information beyond a generic error", async () => {
      getServerSession.mockResolvedValue({ user: { id: moderator.id } });
      const report = await createReport(reporter.id, "actioned");

      const res = await call(report.id);
      const body = await res.json();
      const text = JSON.stringify(body);

      expect(Object.keys(body)).toEqual(["error"]);
      expect(text).not.toContain(moderator.id);
      expect(text).not.toContain(report.id);
      expect(text.toLowerCase()).not.toContain("prisma");
      expect(text.toLowerCase()).not.toContain("database");
    });

    it("admin deletion is captured in the audit log", async () => {
      getServerSession.mockResolvedValue({ user: { id: admin.id } });
      const report = await createReport(reporter.id, "actioned");

      await call(report.id);

      expect(logAdminAction).toHaveBeenCalledTimes(1);
      const [args] = logAdminAction.mock.calls[0];
      expect(args.action).toBe("report.delete");
      expect(args.actor.user.id).toBe(admin.id);
      expect(args.targetId).toBe(report.id);
    });
  }
);
