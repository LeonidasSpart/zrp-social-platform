import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { DELETE } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function deleteReq(id: string) {
  return new NextRequest(`https://zrp.one/api/opportunity/${id}`, { method: "DELETE" });
}

function call(id: string) {
  return DELETE(deleteReq(id), { params: Promise.resolve({ id }) });
}

// Regression coverage for the reported gap: a listing could be posted but
// never removed - no UI exposed a delete action anywhere on web, Android
// or iOS. The route itself (owner-or-admin, hard delete + cascade) turned
// out to already be correct; this file is the missing verification that
// authorization is actually enforced server-side, not merely implied by
// the (also newly added) UI hiding the button from non-owners.
describe.skipIf(!hasRealDatabaseUrl)("DELETE /api/opportunity/[id] (integration, real Postgres)", () => {
  const userIds: string[] = [];
  const listingIds: string[] = [];

  async function createUser(label: string, role: "USER" | "ADMIN" = "USER") {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@opptest.example`,
        username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
        password: "x",
        role,
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createListing(posterId: string) {
    const listing = await prisma.opportunityListing.create({
      data: {
        id: randomUUID(),
        posterId,
        type: "JOB",
        title: "Test listing",
        description: "Test description",
        status: "ACTIVE",
      },
    });
    listingIds.push(listing.id);
    return listing;
  }

  afterAll(async () => {
    await prisma.opportunitySavedListing.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.opportunityApplication.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.opportunityListing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("rejects an unauthenticated request (401), listing untouched", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const owner = await createUser("owner");
    const listing = await createListing(owner.id);

    const res = await call(listing.id);
    expect(res.status).toBe(401);
    expect(await prisma.opportunityListing.findUnique({ where: { id: listing.id } })).not.toBeNull();
  });

  it("404s for a listing that doesn't exist", async () => {
    const owner = await createUser("owner2");
    getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
    const res = await call("nonexistent-opportunity-id");
    expect(res.status).toBe(404);
  });

  it("rejects deletion by a user who does not own the listing - the IDOR scenario (403)", async () => {
    const owner = await createUser("owner3");
    const attacker = await createUser("attacker");
    const listing = await createListing(owner.id);

    getServerSession.mockResolvedValueOnce({ user: { id: attacker.id } });
    const res = await call(listing.id);
    expect(res.status).toBe(403);

    // Must not be deleted - authorization is enforced before the
    // database write, not merely a hidden button on the client.
    expect(await prisma.opportunityListing.findUnique({ where: { id: listing.id } })).not.toBeNull();
  });

  it("lets the owner delete their own listing, cascading applications and saved rows", async () => {
    const owner = await createUser("owner4");
    const applicant = await createUser("applicant");
    const saver = await createUser("saver");
    const listing = await createListing(owner.id);

    await prisma.opportunityApplication.create({
      data: { listingId: listing.id, applicantId: applicant.id, status: "PENDING" },
    });
    await prisma.opportunitySavedListing.create({
      data: { userId: saver.id, listingId: listing.id },
    });

    getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
    const res = await call(listing.id);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    expect(await prisma.opportunityListing.findUnique({ where: { id: listing.id } })).toBeNull();
    expect(
      await prisma.opportunityApplication.findMany({ where: { listingId: listing.id } })
    ).toHaveLength(0);
    expect(
      await prisma.opportunitySavedListing.findMany({ where: { listingId: listing.id } })
    ).toHaveLength(0);
  });

  it("lets an admin (non-owner, non-moderator) delete another user's listing", async () => {
    const owner = await createUser("owner5");
    const admin = await createUser("admin", "ADMIN");
    const listing = await createListing(owner.id);

    getServerSession.mockResolvedValueOnce({ user: { id: admin.id } });
    const res = await call(listing.id);
    expect(res.status).toBe(200);
    expect(await prisma.opportunityListing.findUnique({ where: { id: listing.id } })).toBeNull();
  });

  it("repeated DELETE on an already-deleted listing 404s the second time, never 500s", async () => {
    const owner = await createUser("owner6");
    const listing = await createListing(owner.id);

    getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
    const first = await call(listing.id);
    expect(first.status).toBe(200);

    getServerSession.mockResolvedValueOnce({ user: { id: owner.id } });
    const second = await call(listing.id);
    expect(second.status).toBe(404);
  });

  it("two concurrent DELETE calls from the owner resolve to exactly one success and one 404, never a 500", async () => {
    const owner = await createUser("owner7");
    const listing = await createListing(owner.id);

    getServerSession.mockResolvedValue({ user: { id: owner.id } });
    const [a, b] = await Promise.all([call(listing.id), call(listing.id)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 404]);

    expect(await prisma.opportunityListing.findUnique({ where: { id: listing.id } })).toBeNull();
  });
});
