import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

// The route resolves the session via `(await import("next-auth")).getServerSession(...)`
// rather than a static import, but vi.mock intercepts the module registry either way.
const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function req(body: unknown) {
  return new NextRequest("https://zrp.one/api/music/artists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sessionFor(userId: string) {
  return { user: { id: userId, name: null, username: `u${userId.slice(0, 8)}` } };
}

// Regression coverage for F1: POST /api/music/artists upserts a MusicArtist
// row and is called by several different flows (apply-for-artist, track
// publish, album creation, and the actual Artist Profile settings save)
// that each send a different subset of fields. It used to write
// `body.bio || null` / `body.avatarUrl || null` / `body.bannerUrl || null`
// unconditionally on every update, so any caller that omitted those keys
// (all but the settings save) silently wiped an existing artist's bio,
// avatar, and banner back to null.
describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/music/artists (integration, real Postgres)",
  () => {
    const userIds: string[] = [];

    async function createUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${randomUUID().slice(0, 8)}@musictest.example`,
          username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      return user;
    }

    async function createArtistWithProfile(userId: string) {
      return prisma.musicArtist.create({
        data: {
          userId,
          displayName: "Original Name",
          bio: "Original bio",
          avatarUrl: "https://cdn.example/original-avatar.png",
          bannerUrl: "https://cdn.example/original-banner.png",
        },
      });
    }

    afterAll(async () => {
      await prisma.musicArtist.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("TEST 1: creates a new artist successfully", async () => {
      const user = await createUser("create");
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));

      const res = await POST(req({ displayName: "Brand New Artist" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe("Brand New Artist");
      expect(body.bio).toBeNull();
      expect(body.avatarUrl).toBeNull();
      expect(body.bannerUrl).toBeNull();

      const stored = await prisma.musicArtist.findUnique({ where: { userId: user.id } });
      expect(stored?.displayName).toBe("Brand New Artist");
    });

    it("TEST 2 / TEST 6: an update that omits bio/avatar/banner leaves all three untouched", async () => {
      const user = await createUser("nofields");
      await createArtistWithProfile(user.id);
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));

      const res = await POST(req({ displayName: "New Name" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.displayName).toBe("New Name");
      expect(body.bio).toBe("Original bio");
      expect(body.avatarUrl).toBe("https://cdn.example/original-avatar.png");
      expect(body.bannerUrl).toBe("https://cdn.example/original-banner.png");
    });

    it("TEST 3: an explicit bio update applies, leaving avatar/banner untouched", async () => {
      const user = await createUser("bio");
      await createArtistWithProfile(user.id);
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));

      const res = await POST(req({ bio: "Updated bio" }));
      const body = await res.json();
      expect(body.bio).toBe("Updated bio");
      expect(body.avatarUrl).toBe("https://cdn.example/original-avatar.png");
      expect(body.bannerUrl).toBe("https://cdn.example/original-banner.png");
    });

    it("TEST 4: an explicit avatar update applies, leaving bio/banner untouched", async () => {
      const user = await createUser("avatar");
      await createArtistWithProfile(user.id);
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));

      const res = await POST(req({ avatarUrl: "https://cdn.example/new-avatar.png" }));
      const body = await res.json();
      expect(body.avatarUrl).toBe("https://cdn.example/new-avatar.png");
      expect(body.bio).toBe("Original bio");
      expect(body.bannerUrl).toBe("https://cdn.example/original-banner.png");
    });

    it("TEST 5: an explicit banner update applies, leaving bio/avatar untouched", async () => {
      const user = await createUser("banner");
      await createArtistWithProfile(user.id);
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));

      const res = await POST(req({ bannerUrl: "https://cdn.example/new-banner.png" }));
      const body = await res.json();
      expect(body.bannerUrl).toBe("https://cdn.example/new-banner.png");
      expect(body.bio).toBe("Original bio");
      expect(body.avatarUrl).toBe("https://cdn.example/original-avatar.png");
    });

    it("an explicit null still clears a field (Artist Profile settings clearing bio)", async () => {
      const user = await createUser("clear");
      await createArtistWithProfile(user.id);
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));

      const res = await POST(req({ bio: null, avatarUrl: "https://cdn.example/original-avatar.png", bannerUrl: "https://cdn.example/original-banner.png" }));
      const body = await res.json();
      expect(body.bio).toBeNull();
      expect(body.avatarUrl).toBe("https://cdn.example/original-avatar.png");
      expect(body.bannerUrl).toBe("https://cdn.example/original-banner.png");
    });

    it("TEST 7: reproduces the web Music publish flow's request shape (displayName only, or none at all)", async () => {
      const user = await createUser("publish");
      await createArtistWithProfile(user.id);
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));

      // MusicStudio's publish() sends `{ displayName: artistName || undefined }`,
      // which JSON.stringify's down to "{}" whenever artistName is empty -
      // exactly reproduced here.
      const res = await POST(req({}));
      const body = await res.json();
      expect(body.bio).toBe("Original bio");
      expect(body.avatarUrl).toBe("https://cdn.example/original-avatar.png");
      expect(body.bannerUrl).toBe("https://cdn.example/original-banner.png");
    });

    it("TEST 8: reproduces the web album-creation flow's request shape (empty body)", async () => {
      const user = await createUser("album");
      await createArtistWithProfile(user.id);
      getServerSession.mockResolvedValueOnce(sessionFor(user.id));

      // MusicStudio's album create() sends `body: JSON.stringify({})` verbatim.
      const res = await POST(req({}));
      const body = await res.json();
      expect(body.bio).toBe("Original bio");
      expect(body.avatarUrl).toBe("https://cdn.example/original-avatar.png");
      expect(body.bannerUrl).toBe("https://cdn.example/original-banner.png");
    });

    it("TEST 9: still rejects unauthenticated requests, and never touches the database", async () => {
      const user = await createUser("unauth");
      await createArtistWithProfile(user.id);
      getServerSession.mockResolvedValueOnce(null);

      const res = await POST(req({ displayName: "Hijacked Name" }));
      expect(res.status).toBe(401);

      const stored = await prisma.musicArtist.findUnique({ where: { userId: user.id } });
      expect(stored?.displayName).toBe("Original Name");
    });

    it("a user can only ever upsert their own MusicArtist row (ownership from the session, not the request)", async () => {
      const owner = await createUser("owner");
      const attacker = await createUser("attacker");
      const artist = await createArtistWithProfile(owner.id);
      getServerSession.mockResolvedValueOnce(sessionFor(attacker.id));

      // Even if a request body tried to smuggle in the victim's artist/user
      // id, the route only ever keys off session.user.id.
      const res = await POST(req({ id: artist.id, userId: owner.id, displayName: "Not Mine" }));
      expect(res.status).toBe(200);

      const ownerArtist = await prisma.musicArtist.findUnique({ where: { userId: owner.id } });
      expect(ownerArtist?.displayName).toBe("Original Name");

      const attackerArtist = await prisma.musicArtist.findUnique({ where: { userId: attacker.id } });
      expect(attackerArtist?.displayName).toBe("Not Mine");
    });
  }
);
