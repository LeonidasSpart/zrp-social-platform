import { describe, it, expect, vi, afterAll, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { prisma } from "@/lib/db";
import { __resetAuthStateCacheForTests } from "@/lib/auth-state";
import { GET as getTicket } from "../route";
import { GET as listTickets } from "../../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

/*
 * Staff "internal notes" on a support ticket (isInternal, written from
 * the admin ticket view) must never reach the ticket owner. The owner's
 * ticket page reads GET /api/support/tickets/[id], which used to return
 * every reply unfiltered - internal notes included.
 */
describe.skipIf(!hasRealDatabaseUrl)("support tickets - internal notes (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  let ownerId = "";
  let adminId = "";
  let ticketId = "";

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `owner-${suffix}@ticketnotes.example`, username: `tnowner${suffix}`, password: "x" },
    });
    const admin = await prisma.user.create({
      data: { email: `admin-${suffix}@ticketnotes.example`, username: `tnadmin${suffix}`, password: "x", role: "ADMIN" },
    });
    ownerId = owner.id;
    adminId = admin.id;
    const ticket = await prisma.supportTicket.create({
      data: { userId: ownerId, subject: "Help", message: "Something broke" },
    });
    ticketId = ticket.id;
    await prisma.ticketReply.create({
      data: { ticketId, userId: adminId, message: "public answer", isInternal: false, createdAt: new Date(Date.now() - 60_000) },
    });
    await prisma.ticketReply.create({
      data: { ticketId, userId: adminId, message: "INTERNAL: user looks like a chargeback risk", isInternal: true },
    });
    __resetAuthStateCacheForTests();
  });

  afterAll(async () => {
    await prisma.supportTicket.deleteMany({ where: { id: ticketId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } });
  });

  const get = () =>
    getTicket(new NextRequest(`https://zrp.one/api/support/tickets/${ticketId}`), {
      params: Promise.resolve({ id: ticketId }),
    });

  it("hides internal notes from the ticket owner", async () => {
    getServerSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.replies.map((r: { message: string }) => r.message)).toEqual(["public answer"]);
  });

  it("still shows internal notes to an admin", async () => {
    getServerSession.mockResolvedValue({ user: { id: adminId } });
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.replies).toHaveLength(2);
  });

  it("the owner's ticket list neither previews nor counts internal notes", async () => {
    getServerSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await listTickets(new NextRequest("https://zrp.one/api/support/tickets"));
    expect(res.status).toBe(200);
    const [ticket] = (await res.json()).filter((t: { id: string }) => t.id === ticketId);
    expect(ticket._count.replies).toBe(1);
    expect(ticket.replies[0].message).toBe("public answer");
  });
});
