import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(username: string) {
  return new NextRequest(new URL(`https://zrp.one/api/users/${username}`));
}

function sessionFor(userId: string) {
  return { user: { id: userId } };
}

function call(username: string): Promise<NextResponse> {
  // GET's inferred return type includes `undefined` only because
  // rate-limit.ts's own success branch leaves `response` optional on
  // the type - it never actually returns it (see the route's early
  // `if (!limit.success) return limit.response`, gated on success).
  return GET(req(username), { params: Promise.resolve({ username }) }) as Promise<NextResponse>;
}

// Regression coverage for the "Follows you" audit finding: the profile
// response already computed isFollowing (viewer -> profile) and isBlocked,
// but never the reverse follow edge (profile -> viewer), so neither web
// nor Android could render X's "Follows you" signal. followsMe is a pure
// additive read alongside the existing two - no schema change, no change
// to the existing isFollowing/isBlocked shape or values.
describe.skipIf(!hasRealDatabaseUrl)(
  "GET /api/users/[username] - follow relationship fields (integration, real Postgres)",
  () => {
    const userIds: string[] = [];

    async function createUser(label: string, overrides: Record<string, unknown> = {}) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@profiletest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
          password: "x",
          role: "USER",
          ...overrides,
        },
      });
      userIds.push(user.id);
      return user;
    }

    afterAll(async () => {
      await prisma.follow.deleteMany({ where: { OR: userIds.map((id) => ({ followerId: id })) } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("followsMe is false and isFollowing is false with no follow edges either way", async () => {
      const viewer = await createUser("nofollowa");
      const profileOwner = await createUser("nofollowb");
      getServerSession.mockResolvedValueOnce(sessionFor(viewer.id));

      const res = await call(profileOwner.username);
      const body = await res.json();

      expect(body.isFollowing).toBe(false);
      expect(body.followsMe).toBe(false);
    });

    it("followsMe is true when the profile owner follows the viewer, independent of isFollowing", async () => {
      const viewer = await createUser("backfollowa");
      const profileOwner = await createUser("backfollowb");
      await prisma.follow.create({
        data: { followerId: profileOwner.id, followingId: viewer.id },
      });
      getServerSession.mockResolvedValueOnce(sessionFor(viewer.id));

      const res = await call(profileOwner.username);
      const body = await res.json();

      // The viewer does NOT follow the profile owner - only the reverse
      // edge exists, so isFollowing must stay false while followsMe flips.
      expect(body.isFollowing).toBe(false);
      expect(body.followsMe).toBe(true);
    });

    it("mutual follow reports both isFollowing and followsMe as true", async () => {
      const viewer = await createUser("mutuala");
      const profileOwner = await createUser("mutualb");
      await prisma.follow.create({
        data: { followerId: viewer.id, followingId: profileOwner.id },
      });
      await prisma.follow.create({
        data: { followerId: profileOwner.id, followingId: viewer.id },
      });
      getServerSession.mockResolvedValueOnce(sessionFor(viewer.id));

      const res = await call(profileOwner.username);
      const body = await res.json();

      expect(body.isFollowing).toBe(true);
      expect(body.followsMe).toBe(true);
    });

    it("followsMe is false (not an error) for an unauthenticated request", async () => {
      const profileOwner = await createUser("anona");
      getServerSession.mockResolvedValueOnce(null);

      const res = await call(profileOwner.username);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.followsMe).toBe(false);
      expect(body.isFollowing).toBe(false);
    });

    it("followsMe is false on a user's own profile (no self-follow edge to find)", async () => {
      const owner = await createUser("selfa");
      getServerSession.mockResolvedValueOnce(sessionFor(owner.id));

      const res = await call(owner.username);
      const body = await res.json();
      expect(body.followsMe).toBe(false);
    });
  }
);
