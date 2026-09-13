import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { prisma } from "@/lib/db";
import { POST as createReport } from "../route";

/*
 * Report-on-profile: a bare account report (harassment, impersonation,
 * fake account) with no post/comment/listing attached. Previously
 * /api/reports rejected any request that didn't carry one of
 * postId/commentId/listingId/challengeId/opportunityId/campaignId - a
 * profile page had nowhere to send a report against the account itself.
 * `userId` on the request now maps to the new `reportedUserId`
 * polymorphic target on Report (see prisma/schema.prisma), distinct
 * from `targetUserId`, which is only ever denormalized once an admin
 * actions the report.
 *
 * Real Postgres (see CLAUDE.md: *.integration.test.ts skips itself
 * without DATABASE_URL) because the interesting behavior is genuine
 * database state - the row actually carrying reportedUserId, and the
 * real duplicate-pending-report / self-report guards.
 */
const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

function jsonReq(body?: unknown) {
  return new NextRequest("https://zrp.one/api/reports", {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    headers: { "Content-Type": "application/json" },
  });
}

describe.skipIf(!hasRealDatabaseUrl)("POST /api/reports - report a bare profile (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const reportIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@profilereporttest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.report.deleteMany({ where: { id: { in: reportIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("401s without a session", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await createReport(jsonReq({ userId: "someone", reason: "Spam" }));
    expect(res.status).toBe(401);
  });

  it("400s when neither a target nor userId is given", async () => {
    const reporter = await createUser("noTarget");
    getServerSession.mockResolvedValueOnce(sessionFor(reporter.id));
    const res = await createReport(jsonReq({ reason: "Spam" }));
    expect(res.status).toBe(400);
  });

  it("400s reporting your own account", async () => {
    const reporter = await createUser("self");
    getServerSession.mockResolvedValueOnce(sessionFor(reporter.id));
    const res = await createReport(jsonReq({ userId: reporter.id, reason: "Spam" }));
    expect(res.status).toBe(400);
  });

  it("creates a real report with reportedUserId set, and no other polymorphic target", async () => {
    const reporter = await createUser("reporter");
    const target = await createUser("target");

    getServerSession.mockResolvedValueOnce(sessionFor(reporter.id));
    const res = await createReport(
      jsonReq({ userId: target.id, reason: "Harassment or bullying", details: "Repeated DMs after being asked to stop." })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    reportIds.push(body.id);

    const stored = await prisma.report.findUnique({ where: { id: body.id } });
    expect(stored?.reporterId).toBe(reporter.id);
    expect(stored?.reportedUserId).toBe(target.id);
    expect(stored?.postId).toBeNull();
    expect(stored?.commentId).toBeNull();
    expect(stored?.status).toBe("pending");
  });

  it("409s a second pending report on the same account from the same reporter", async () => {
    const reporter = await createUser("dupReporter");
    const target = await createUser("dupTarget");

    getServerSession.mockResolvedValueOnce(sessionFor(reporter.id));
    const first = await createReport(jsonReq({ userId: target.id, reason: "Spam" }));
    expect(first.status).toBe(201);
    reportIds.push((await first.json()).id);

    getServerSession.mockResolvedValueOnce(sessionFor(reporter.id));
    const second = await createReport(jsonReq({ userId: target.id, reason: "Spam" }));
    expect(second.status).toBe(409);
  });
});
