import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

function call(id: string) {
  return GET(new NextRequest(`https://zrp.one/api/opportunity/${id}`), {
    params: Promise.resolve({ id }),
  });
}

// Regression coverage for the audit finding (ios-native/PARITY.md, "Save a
// listing" row): POST/DELETE /api/opportunity/{id}/save only ever answer
// with the state they just set - nothing told a caller of the listing
// detail route whether the viewer had already saved it on a prior visit,
// so the bookmark icon always started unfilled regardless of actual
// state, the same gap `alreadyApplied` already existed to fix for Apply.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/opportunity/[id] (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const listingIds: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@opptest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
          password: "x",
          role: "USER",
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
      await prisma.opportunityListing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("reports alreadySaved:true only after the viewer has saved the listing", async () => {
      const poster = await createUser("poster");
      const viewer = await createUser("viewer");
      const listing = await createListing(poster.id);

      getServerSession.mockResolvedValue(sessionFor(viewer.id));

      const before = await call(listing.id);
      expect((await before.json()).listing.alreadySaved).toBe(false);

      await prisma.opportunitySavedListing.create({
        data: { userId: viewer.id, listingId: listing.id },
      });

      const after = await call(listing.id);
      expect((await after.json()).listing.alreadySaved).toBe(true);
    });

    it("reports alreadySaved:false for an unauthenticated viewer", async () => {
      const poster = await createUser("poster2");
      const listing = await createListing(poster.id);

      getServerSession.mockResolvedValue(null);
      const res = await call(listing.id);
      expect((await res.json()).listing.alreadySaved).toBe(false);
    });

    it("reports alreadySaved:false for the listing's own owner", async () => {
      const poster = await createUser("poster3");
      const listing = await createListing(poster.id);

      // Even if the poster somehow saved their own listing, the save
      // button (and therefore this check) is never shown to the owner -
      // same scoping as the existing alreadyApplied check.
      await prisma.opportunitySavedListing.create({
        data: { userId: poster.id, listingId: listing.id },
      });

      getServerSession.mockResolvedValue(sessionFor(poster.id));
      const res = await call(listing.id);
      expect((await res.json()).listing.alreadySaved).toBe(false);
    });
  }
);
