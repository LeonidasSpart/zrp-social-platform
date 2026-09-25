import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { PUT } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Bait-and-switch regression: an approved (ACTIVE) listing's "Apply
// externally" link could be swapped for any other URL without the
// listing going back through staff review.
describe.skipIf(!hasRealDatabaseUrl)(
  "PUT /api/opportunity/[id] - externalUrl change re-review (integration)",
  () => {
    const userIds: string[] = [];
    const listingIds: string[] = [];

    afterAll(async () => {
      await prisma.opportunityListing.deleteMany({ where: { id: { in: listingIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function setup(externalUrl: string | null) {
      const poster = await prisma.user.create({
        data: {
          email: `poster-${randomUUID().slice(0, 8)}@opptest.example`,
          username: `poster${randomUUID().slice(0, 6)}`,
          password: "x",
        },
      });
      userIds.push(poster.id);
      const listing = await prisma.opportunityListing.create({
        data: {
          id: randomUUID(),
          posterId: poster.id,
          type: "JOB",
          title: "Approved job",
          description: "Approved description",
          externalUrl,
          status: "ACTIVE",
        },
      });
      listingIds.push(listing.id);
      getServerSession.mockResolvedValue({ user: { id: poster.id } });
      return listing;
    }

    function put(id: string, body: unknown) {
      return PUT(
        new NextRequest(`https://zrp.one/api/opportunity/${id}`, {
          method: "PUT",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }),
        { params: Promise.resolve({ id }) }
      );
    }

    it("sends an ACTIVE listing back to PENDING_REVIEW when its externalUrl changes", async () => {
      const listing = await setup("https://jobs.example.com/apply");
      const res = await put(listing.id, { externalUrl: "https://phish.example.net/login" });
      expect(res.status).toBe(200);
      const row = await prisma.opportunityListing.findUnique({ where: { id: listing.id } });
      expect(row?.externalUrl).toBe("https://phish.example.net/login");
      expect(row?.status).toBe("PENDING_REVIEW");
    });

    it("keeps an ACTIVE listing live when the same externalUrl is re-sent", async () => {
      const listing = await setup("https://jobs.example.com/apply");
      const res = await put(listing.id, { externalUrl: "https://jobs.example.com/apply", location: "Remote" });
      expect(res.status).toBe(200);
      const row = await prisma.opportunityListing.findUnique({ where: { id: listing.id } });
      expect(row?.status).toBe("ACTIVE");
    });
  }
);
