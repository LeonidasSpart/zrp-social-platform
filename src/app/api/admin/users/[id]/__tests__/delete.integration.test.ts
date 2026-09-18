import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

/*
 * Regression coverage for N2: this route used to reimplement its own,
 * independent list of "every model that can own an upload" instead of
 * using the shared deleteUserAccountAndFiles() helper (src/lib/account-
 * deletion.ts) that the self-service "delete my account" path already
 * used - and its own inline comment admitted the two had "the identical
 * gap." The admin path's list covered only avatar/cover/posts/comments/
 * SENT messages/stories, silently leaving music tracks, albums, the
 * artist profile, playlists, marketplace listings, HELP campaign
 * images/proof, opportunity application resumes, and RECEIVED messages
 * orphaned in UploadThing forever - nothing in the database referenced
 * them anymore to ever find them again.
 *
 * deleteUserAccountAndFiles() itself already has its own thorough
 * integration coverage (src/lib/__tests__/account-deletion.test.ts:
 * avatar/cover collection, post cascade, no-op on a missing user). What
 * this file proves is specifically that THIS ROUTE now reaches that
 * complete helper - exercised here through a category (a music track,
 * reached only via MusicArtist -> MusicTrack, never through
 * authorId/senderId/userId the way posts/comments/messages/stories are)
 * that the old inline list could never have covered no matter how it
 * was tuned, since it never queried the music models at all.
 */
const { deleteUploadThingKeys } = vi.hoisted(() => ({
  deleteUploadThingKeys: vi.fn(async (keys: string[]) => ({
    requested: keys.length,
    unique: keys.length,
    deleted: keys.length,
    failed: 0,
    retried: 0,
  })),
}));
vi.mock("@/lib/uploadthing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/uploadthing")>();
  return { ...actual, deleteUploadThingKeys };
});

const { requireAdmin, logAdminAction } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  logAdminAction: vi.fn(),
}));
vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

import { prisma } from "@/lib/db";
import { DELETE } from "../route";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function call(userId: string) {
  return DELETE(
    new NextRequest(`https://zrp.one/api/admin/users/${userId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: userId }) }
  );
}

describe.skipIf(!hasRealDatabaseUrl)(
  "DELETE /api/admin/users/[id] (integration, real Postgres)",
  () => {
    const userIds: string[] = [];

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("returns 404 without deleting anything when the target user does not exist", async () => {
      requireAdmin.mockResolvedValue({ authorized: true, session: { user: { id: "admin-1" } } });
      const res = await call(randomUUID());
      expect(res.status).toBe(404);
    });

    it("[N2] reaches a category the old inline collection never covered - a music track owned only via MusicArtist, not authorId/senderId/userId", async () => {
      requireAdmin.mockResolvedValue({ authorized: true, session: { user: { id: "admin-1" } } });
      deleteUploadThingKeys.mockClear();

      const user = await prisma.user.create({
        data: {
          email: `admin-del-${randomUUID().slice(0, 8)}@deltest.example`,
          username: `admindel${randomUUID().slice(0, 8)}`,
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);

      const artist = await prisma.musicArtist.create({
        data: { userId: user.id, displayName: "Test Artist", avatarUrl: "https://utfs.io/f/artist-avatar-key" },
      });
      await prisma.musicTrack.create({
        data: {
          artistId: artist.id,
          title: "Test Track",
          audioUrl: "https://utfs.io/f/track-audio-key",
          coverUrl: "https://utfs.io/f/track-cover-key",
        },
      });

      const res = await call(user.id);
      expect(res.status).toBe(200);

      const foundUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(foundUser).toBeNull();
      const foundArtist = await prisma.musicArtist.findUnique({ where: { id: artist.id } });
      expect(foundArtist).toBeNull();

      expect(deleteUploadThingKeys).toHaveBeenCalledTimes(1);
      const keys = deleteUploadThingKeys.mock.calls[0][0] as string[];
      expect(keys).toContain("artist-avatar-key");
      expect(keys).toContain("track-audio-key");
      expect(keys).toContain("track-cover-key");
    });

    it("does not delete a file still referenced by a surviving, unrelated user", async () => {
      requireAdmin.mockResolvedValue({ authorized: true, session: { user: { id: "admin-1" } } });
      deleteUploadThingKeys.mockClear();

      const survivor = await prisma.user.create({
        data: {
          email: `survivor-${randomUUID().slice(0, 8)}@deltest.example`,
          username: `survivor${randomUUID().slice(0, 8)}`,
          password: "x",
          role: "USER",
          avatarUrl: "https://utfs.io/f/shared-avatar-key",
        },
      });
      userIds.push(survivor.id);

      const target = await prisma.user.create({
        data: {
          email: `target-${randomUUID().slice(0, 8)}@deltest.example`,
          username: `target${randomUUID().slice(0, 8)}`,
          password: "x",
          role: "USER",
          // Same key as the survivor's avatar - simulates a shared/reused
          // upload, which deleteUploadsIfUnreferenced must detect and
          // refuse to delete regardless of which user triggered the scan.
          coverUrl: "https://utfs.io/f/shared-avatar-key",
        },
      });
      userIds.push(target.id);

      const res = await call(target.id);
      expect(res.status).toBe(200);

      const foundSurvivor = await prisma.user.findUnique({ where: { id: survivor.id } });
      expect(foundSurvivor).not.toBeNull();
      expect(foundSurvivor?.avatarUrl).toBe("https://utfs.io/f/shared-avatar-key");

      const deletedKeys = (deleteUploadThingKeys.mock.calls[0]?.[0] as string[]) ?? [];
      expect(deletedKeys).not.toContain("shared-avatar-key");
    });
  }
);
