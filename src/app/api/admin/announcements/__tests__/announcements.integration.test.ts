import { describe, it, expect, vi, afterAll, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { getServerSession, logAdminAction } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

vi.mock("@/lib/push-notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/push-notifications")>();
  return { ...actual, sendPushNotification: vi.fn(actual.sendPushNotification) };
});

import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/push-notifications";
import { POST as createAnnouncement, GET as listAnnouncements } from "../route";
import { GET as getAnnouncement } from "../[id]/route";
import { POST as sendAnnouncement } from "../[id]/send/route";
import { POST as cancelAnnouncement } from "../[id]/cancel/route";
import { GET as cronBroadcasts } from "@/app/api/cron/broadcasts/route";
import { GET as listNotifications } from "@/app/api/notifications/route";
import { processBroadcastBatches, beginSending } from "@/lib/announcements/dispatch";
import { getAnnouncementSystemUserId } from "@/lib/announcements/system-user";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");
const mockedSendPush = vi.mocked(sendPushNotification);

function ip() {
  return `10.77.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

function req(method: string, body?: unknown, headers?: Record<string, string>) {
  return new NextRequest("https://zrp.one/api/admin/announcements", {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": ip(), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function withId(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function createUser(label: string, overrides: Record<string, unknown> = {}) {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${randomUUID().slice(0, 8)}@broadcast.example`,
      username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
      password: "x",
      role: "USER",
      ...overrides,
    },
  });
  return user;
}

describe.skipIf(!hasRealDatabaseUrl)("Global announcement broadcast system (integration)", () => {
  const userIds: string[] = [];
  const announcementIds: string[] = [];

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { announcementId: { in: announcementIds } } });
    await prisma.announcement.deleteMany({ where: { id: { in: announcementIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { fromUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  let realSendPush: typeof sendPushNotification;
  beforeAll(async () => {
    const actual = await vi.importActual<typeof import("@/lib/push-notifications")>("@/lib/push-notifications");
    realSendPush = actual.sendPushNotification;
  });

  // mockResolvedValueOnce() queues are FIFO across the WHOLE mock, not
  // per-test - without a reset here, an unconsumed queued session (or a
  // sendPushNotification override left behind by one test, e.g. the
  // throwing implementation in the "invalid token" test below) would
  // leak into whichever test runs next.
  beforeEach(() => {
    getServerSession.mockReset();
    logAdminAction.mockReset();
    mockedSendPush.mockReset();
    mockedSendPush.mockImplementation(realSendPush);
  });

  async function admin() {
    const u = await createUser("admin", { role: "ADMIN" });
    userIds.push(u.id);
    getServerSession.mockResolvedValueOnce({ user: { id: u.id, username: u.username } });
    return u;
  }

  async function plainUser() {
    const u = await createUser("mod", { role: "MODERATOR" });
    userIds.push(u.id);
    getServerSession.mockResolvedValueOnce({ user: { id: u.id, username: u.username } });
    return u;
  }

  it("1. an unauthenticated/unauthorized caller cannot create an announcement", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const res = await createAnnouncement(req("POST", { title: "Hi", body: "Hello" }));
    expect(res.status).toBe(401);
  });

  it("1b. a non-admin (moderator) cannot create an announcement", async () => {
    await plainUser();
    const res = await createAnnouncement(req("POST", { title: "Hi", body: "Hello" }));
    expect(res.status).toBe(403);
  });

  it("3. an authorized admin can create a draft announcement, and it is audited", async () => {
    await admin();
    const res = await createAnnouncement(req("POST", { title: "Maintenance window", body: "We will be down briefly.", type: "MAINTENANCE" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("DRAFT");
    announcementIds.push(body.id);
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: "announcement.create" }));
  });

  it("2. an unauthorized user cannot send an announcement", async () => {
    await admin();
    const createRes = await createAnnouncement(req("POST", { title: "X", body: "Y" }));
    const { id } = await createRes.json();
    announcementIds.push(id);

    getServerSession.mockResolvedValueOnce(null);
    const sendRes = await sendAnnouncement(req("POST", undefined, { "x-forwarded-for": ip() }), withId(id));
    expect(sendRes.status).toBe(401);

    const unchanged = await prisma.announcement.findUnique({ where: { id } });
    expect(unchanged?.status).toBe("DRAFT");
  });

  it("4 & 8 & 9: admin can send to all eligible users; multi-device push dispatched; disabled/opted-out users excluded; audited", async () => {
    const adminUser = await admin();

    const eligible1 = await createUser("eligible1");
    const eligible2 = await createUser("eligible2");
    const banned = await createUser("banned", { banned: true });
    const deletionRequested = await createUser("deleting", { deletionRequestedAt: new Date() });
    userIds.push(eligible1.id, eligible2.id, banned.id, deletionRequested.id);

    // Multi-device: eligible1 has two push-capable devices.
    await prisma.fcmToken.create({ data: { userId: eligible1.id, token: `tok-android-${randomUUID()}`, platform: "android" } });
    await prisma.fcmToken.create({ data: { userId: eligible1.id, token: `tok-ios-${randomUUID()}`, platform: "ios" } });

    const createRes = await createAnnouncement(req("POST", { title: "Big news", body: "ZRP has a new feature.", type: "NEW_FEATURE" }));
    const created = await createRes.json();
    announcementIds.push(created.id);

    getServerSession.mockResolvedValueOnce({ user: { id: adminUser.id, username: adminUser.username } });
    const sendRes = await sendAnnouncement(req("POST", undefined, { "x-forwarded-for": ip() }), withId(created.id));
    expect(sendRes.status).toBe(202);
    const sendBody = await sendRes.json();
    expect(sendBody.status).toBe("SENDING");

    // Fire-and-forget processing was kicked off in-process; wait for it
    // to finish by polling the row (bounded, small test audience).
    let finalStatus = "SENDING";
    for (let i = 0; i < 50 && finalStatus === "SENDING"; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const row = await prisma.announcement.findUnique({ where: { id: created.id } });
      finalStatus = row!.status;
    }
    expect(finalStatus).toBe("SENT");

    const sentUserIds = mockedSendPush.mock.calls.map((c) => c[0]);
    expect(sentUserIds).toContain(eligible1.id);
    expect(sentUserIds).toContain(eligible2.id);
    expect(sentUserIds).not.toContain(banned.id);
    expect(sentUserIds).not.toContain(deletionRequested.id);
    // Exactly one sendPushNotification call per eligible user - it fans
    // out to that user's own devices internally; the broadcast layer
    // must not call it once per device.
    expect(sentUserIds.filter((id) => id === eligible1.id)).toHaveLength(1);

    const notif1 = await prisma.notification.findFirst({ where: { userId: eligible1.id, announcementId: created.id } });
    expect(notif1).not.toBeNull();
    expect(notif1?.type).toBe("announcement");
    const bannedNotif = await prisma.notification.findFirst({ where: { userId: banned.id, announcementId: created.id } });
    expect(bannedNotif).toBeNull();

    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: "announcement.send" }));
  });

  it("5. duplicate send is blocked by the atomic status transition", async () => {
    await admin();
    const createRes = await createAnnouncement(req("POST", { title: "Once only", body: "Should not double-send." }));
    const { id } = await createRes.json();
    announcementIds.push(id);

    getServerSession.mockResolvedValueOnce({ user: { id: (await prisma.announcement.findUnique({ where: { id } }))!.createdById } });
    const first = await sendAnnouncement(req("POST", undefined, { "x-forwarded-for": ip() }), withId(id));
    expect(first.status).toBe(202);

    getServerSession.mockResolvedValueOnce({ user: { id: (await prisma.announcement.findUnique({ where: { id } }))!.createdById } });
    const second = await sendAnnouncement(req("POST", undefined, { "x-forwarded-for": ip() }), withId(id));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.alreadyInProgress).toBe(true);
  });

  it("6. concurrent send requests for the same announcement: only one actually starts", async () => {
    const adminUser = await admin();
    const draft = await prisma.announcement.create({
      data: { title: "Race", body: "Only one winner.", createdById: adminUser.id, status: "DRAFT" },
    });
    announcementIds.push(draft.id);

    const results = await Promise.all(Array.from({ length: 5 }, () => beginSending(draft.id)));
    const started = results.filter((r) => r.started);
    expect(started).toHaveLength(1);
  });

  it("10 & 11. invalid/throwing push does not abort the batch for other users", async () => {
    const adminUser = await admin();
    const okUser = await createUser("ok-user");
    const brokenUser = await createUser("broken-user");
    userIds.push(okUser.id, brokenUser.id);

    const announcement = await prisma.announcement.create({
      data: { title: "Resilience check", body: "One bad token must not block delivery.", createdById: adminUser.id, status: "DRAFT" },
    });
    announcementIds.push(announcement.id);

    mockedSendPush.mockImplementation(async (userId: string) => {
      if (userId === brokenUser.id) throw new Error("simulated permanently invalid token");
    });

    const outcome = await beginSending(announcement.id);
    expect(outcome.started).toBe(true);
    await processBroadcastBatches(announcement.id, { maxBatches: 10 });

    const row = await prisma.announcement.findUnique({ where: { id: announcement.id } });
    expect(row?.status).toBe("SENT");

    const okNotif = await prisma.notification.findFirst({ where: { userId: okUser.id, announcementId: announcement.id } });
    const brokenNotif = await prisma.notification.findFirst({ where: { userId: brokenUser.id, announcementId: announcement.id } });
    expect(okNotif).not.toBeNull();
    expect(brokenNotif).not.toBeNull(); // the in-app row is independent of push delivery success
  });

  it("13 & 19. the announcement is visible in the existing notification center with its content", async () => {
    const adminUser = await admin();
    const recipient = await createUser("recipient-notif");
    userIds.push(recipient.id);

    const announcement = await prisma.announcement.create({
      data: {
        title: "Check the center",
        body: "This should show up.",
        type: "SECURITY",
        actionUrl: "/settings",
        createdById: adminUser.id,
        status: "DRAFT",
      },
    });
    announcementIds.push(announcement.id);

    await beginSending(announcement.id);
    await processBroadcastBatches(announcement.id, { maxBatches: 10 });

    getServerSession.mockResolvedValueOnce({ user: { id: recipient.id } });
    const res = await listNotifications(
      new NextRequest("https://zrp.one/api/notifications", { headers: { "x-forwarded-for": ip() } })
    );
    const list = await res.json();
    const found = list.find((n: any) => n.announcement?.id === announcement.id);
    expect(found).toBeDefined();
    expect(found.announcement.title).toBe("Check the center");
    expect(found.announcement.actionUrl).toBe("/settings");
    expect(found.read).toBe(false);
  });

  it("14 & 15. a scheduled announcement executes via the cron tick, and can be cancelled before it starts", async () => {
    const adminUser = await admin();
    const recipient = await createUser("sched-recipient");
    userIds.push(recipient.id);

    const future = new Date(Date.now() + 3600_000);
    const dueNow = new Date(Date.now() - 1000); // already due

    const toCancel = await prisma.announcement.create({
      data: { title: "Later", body: "Not yet.", createdById: adminUser.id, status: "SCHEDULED", scheduledAt: future },
    });
    const toExecute = await prisma.announcement.create({
      data: { title: "Due now", body: "Should fire on this tick.", createdById: adminUser.id, status: "SCHEDULED", scheduledAt: dueNow },
    });
    announcementIds.push(toCancel.id, toExecute.id);

    getServerSession.mockResolvedValueOnce({ user: { id: adminUser.id } });
    const cancelRes = await cancelAnnouncement(req("POST", undefined, { "x-forwarded-for": ip() }), withId(toCancel.id));
    expect(cancelRes.status).toBe(200);
    expect((await prisma.announcement.findUnique({ where: { id: toCancel.id } }))?.status).toBe("CANCELLED");

    process.env.CRON_SECRET = process.env.CRON_SECRET || "dev-cron-secret";
    const cronRes = await cronBroadcasts(
      new NextRequest("https://zrp.one/api/cron/broadcasts", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    );
    expect(cronRes.status).toBe(200);
    const cronBody = await cronRes.json();
    expect(cronBody.promoted).toContain(toExecute.id);

    let finalStatus = "SENDING";
    for (let i = 0; i < 50 && finalStatus !== "SENT"; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const row = await prisma.announcement.findUnique({ where: { id: toExecute.id } });
      finalStatus = row!.status;
      if (finalStatus !== "SENDING" && finalStatus !== "SENT") break;
    }
    expect(finalStatus).toBe("SENT");

    // The cancelled one was never touched by the cron tick.
    expect((await prisma.announcement.findUnique({ where: { id: toCancel.id } }))?.status).toBe("CANCELLED");
  });

  it("cron route rejects requests without a valid CRON_SECRET", async () => {
    const res = await cronBroadcasts(new NextRequest("https://zrp.one/api/cron/broadcasts"));
    expect(res.status).toBe(401);
  });

  it("18 & 11. worker retry (re-processing the same batches) does not create duplicate notifications", async () => {
    const adminUser = await admin();
    const recipient = await createUser("retry-recipient");
    userIds.push(recipient.id);

    const announcement = await prisma.announcement.create({
      data: { title: "Retry safe", body: "Must not duplicate.", createdById: adminUser.id, status: "DRAFT" },
    });
    announcementIds.push(announcement.id);

    await beginSending(announcement.id);
    // Simulate a crash-and-resume: process the same not-yet-advanced
    // announcement's batches twice in a row.
    await processBroadcastBatches(announcement.id, { maxBatches: 10 });
    // Re-open for a second pass: force status back to SENDING to prove
    // re-running batch processing against already-delivered users is a
    // no-op, not a duplicate - as a real crash-resume would hit before
    // completedAt is ever set, the unique constraint is what's actually
    // under test here regardless of status bookkeeping.
    await prisma.announcement.update({ where: { id: announcement.id }, data: { status: "SENDING", lastProcessedUserId: null } });
    await processBroadcastBatches(announcement.id, { maxBatches: 10 });

    const rows = await prisma.notification.findMany({ where: { announcementId: announcement.id, userId: recipient.id } });
    expect(rows).toHaveLength(1);
  });

  it("list/history and detail endpoints require admin auth and return real data", async () => {
    getServerSession.mockResolvedValueOnce(null);
    expect((await listAnnouncements(req("GET"))).status).toBe(401);

    const adminUser = await admin();
    const listRes = await listAnnouncements(req("GET"));
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(Array.isArray(body.announcements)).toBe(true);

    const created = await prisma.announcement.create({
      data: { title: "Detail check", body: "For GET [id].", createdById: adminUser.id, status: "DRAFT" },
    });
    announcementIds.push(created.id);

    getServerSession.mockResolvedValueOnce(null);
    expect((await getAnnouncement(req("GET"), withId(created.id))).status).toBe(401);

    getServerSession.mockResolvedValueOnce({ user: { id: adminUser.id } });
    const detailRes = await getAnnouncement(req("GET"), withId(created.id));
    expect(detailRes.status).toBe(200);
    expect((await detailRes.json()).title).toBe("Detail check");

    getServerSession.mockResolvedValueOnce({ user: { id: adminUser.id } });
    const missing = await getAnnouncement(req("GET"), withId("does-not-exist"));
    expect(missing.status).toBe(404);
  });

  it("the reserved system user is excluded from its own broadcast's recipient list", async () => {
    const adminUser = await admin();
    const systemUserId = await getAnnouncementSystemUserId();
    userIds.push(systemUserId); // safe to also clean up if a prior test created it fresh

    const announcement = await prisma.announcement.create({
      data: { title: "Self-exclusion check", body: "System must not notify itself.", createdById: adminUser.id, status: "DRAFT" },
    });
    announcementIds.push(announcement.id);

    await beginSending(announcement.id);
    await processBroadcastBatches(announcement.id, { maxBatches: 10 });

    const selfNotif = await prisma.notification.findFirst({ where: { userId: systemUserId, announcementId: announcement.id } });
    expect(selfNotif).toBeNull();
  });
});
