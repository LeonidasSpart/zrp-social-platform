import { describe, it, expect, vi, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../db";

const { deleteUploadThingFiles } = vi.hoisted(() => ({ deleteUploadThingFiles: vi.fn() }));
vi.mock("@/lib/uploadthing", () => ({ deleteUploadThingFiles }));

import { deleteUserAccountAndFiles } from "../account-deletion";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Regression coverage for the account-deletion audit: this is the shared
// permanent-wipe logic behind both the user-triggered "delete now" path
// (POST /api/user/delete/confirm) and the cron sweep that finishes off
// accounts whose 30-day grace period has passed. Extracted out of the
// confirm route (which used to inline this) so both call sites can never
// drift apart on what actually gets collected and deleted.
describe.skipIf(!hasRealDatabaseUrl)(
  "deleteUserAccountAndFiles (integration, real Postgres)",
  () => {
    const userIds: string[] = [];

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("deletes the user row and passes their own avatar/cover to UploadThing cleanup", async () => {
      deleteUploadThingFiles.mockClear();
      const user = await prisma.user.create({
        data: {
          email: `del-${randomUUID().slice(0, 8)}@deltest.example`,
          username: `del${randomUUID().slice(0, 8)}`,
          password: "x",
          role: "USER",
          avatarUrl: "https://utfs.io/f/avatar-key",
          coverUrl: "https://utfs.io/f/cover-key",
        },
      });
      userIds.push(user.id);

      await deleteUserAccountAndFiles(user.id);

      const found = await prisma.user.findUnique({ where: { id: user.id } });
      expect(found).toBeNull();

      expect(deleteUploadThingFiles).toHaveBeenCalledTimes(1);
      const urls = deleteUploadThingFiles.mock.calls[0][0] as string[];
      expect(urls).toContain("https://utfs.io/f/avatar-key");
      expect(urls).toContain("https://utfs.io/f/cover-key");
    });

    it("cascades away the user's own posts along with the user row", async () => {
      const user = await prisma.user.create({
        data: {
          email: `del2-${randomUUID().slice(0, 8)}@deltest.example`,
          username: `del2${randomUUID().slice(0, 8)}`,
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);

      const post = await prisma.post.create({
        data: { id: randomUUID(), content: "bye", authorId: user.id, status: "published" },
      });

      await deleteUserAccountAndFiles(user.id);

      const foundPost = await prisma.post.findUnique({ where: { id: post.id } });
      expect(foundPost).toBeNull();
    });

    it("is a no-op when the user no longer exists", async () => {
      deleteUploadThingFiles.mockClear();
      await expect(deleteUserAccountAndFiles(randomUUID())).resolves.toBeUndefined();
      expect(deleteUploadThingFiles).not.toHaveBeenCalled();
    });
  }
);
