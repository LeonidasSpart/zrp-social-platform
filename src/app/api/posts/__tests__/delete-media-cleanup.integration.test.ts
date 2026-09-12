import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

const { deleteFiles } = vi.hoisted(() => ({ deleteFiles: vi.fn() }));
vi.mock("uploadthing/server", () => ({
  UTApi: vi.fn().mockImplementation(function UTApiMock(this: { deleteFiles: typeof deleteFiles }) {
    this.deleteFiles = deleteFiles;
  }),
  UploadThingError: class UploadThingError extends Error {},
}));

import { DELETE } from "../[id]/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function delReq() {
  return new NextRequest("https://zrp.one/x", { method: "DELETE" });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const key = () => `PDCK${randomUUID().replace(/-/g, "")}`;

/*
 * Regression coverage for the production incident: DELETE /api/posts/[id]
 * collected `[post.imageUrl, ...post.imageUrls]` for UploadThing cleanup.
 * post.imageUrl is always a copy of post.imageUrls[0] (see POST
 * /api/posts), so for any single-image post that array always contained
 * the exact same key twice - which is what production logs showed
 * ("UploadThing cleanup partial: 0/2 deleted... keys attempted: [K, K]").
 *
 * Also covers the reference-safety gap this route had: it previously
 * called deleteUploadThingFiles() directly, which deletes unconditionally
 * - unlike deleteUploadsIfUnreferenced(), which it now goes through, and
 * which never deletes a file some other row still points at.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "DELETE /api/posts/[id] - UploadThing cleanup (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterAll(async () => {
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    beforeEach(() => {
      deleteFiles.mockReset();
      deleteFiles.mockImplementation(async (keys: string[]) => ({ success: true, deletedCount: keys.length }));
    });

    async function createUser() {
      const user = await prisma.user.create({
        data: {
          email: `pdc-${randomUUID().slice(0, 8)}@posttest.example`,
          username: `pdc${randomUUID().slice(0, 6)}`,
          password: "x",
          role: "USER",
        },
      });
      userIds.push(user.id);
      getServerSession.mockResolvedValue({ user: { id: user.id } });
      return user;
    }

    it("a single-image post never sends the same key to UploadThing twice", async () => {
      const user = await createUser();
      const k = key();
      const post = await prisma.post.create({
        data: {
          authorId: user.id,
          content: "one image",
          imageUrl: `https://utfs.io/f/${k}`,
          imageUrls: [`https://utfs.io/f/${k}`],
        },
      });
      postIds.push(post.id);

      const res = await DELETE(delReq(), params(post.id));
      expect(res.status).toBe(200);

      // The bug: this used to be called with [k, k] (the exact same key
      // twice). It must now be called with the key exactly once.
      expect(deleteFiles).toHaveBeenCalledTimes(1);
      expect(deleteFiles).toHaveBeenCalledWith([k]);
    });

    it("both images of a two-image post are deleted, each exactly once", async () => {
      const user = await createUser();
      const k1 = key();
      const k2 = key();
      const post = await prisma.post.create({
        data: {
          authorId: user.id,
          content: "two images",
          imageUrl: `https://utfs.io/f/${k1}`,
          imageUrls: [`https://utfs.io/f/${k1}`, `https://utfs.io/f/${k2}`],
        },
      });
      postIds.push(post.id);

      await DELETE(delReq(), params(post.id));

      const sentKeys = deleteFiles.mock.calls.map((c) => c[0][0]).sort();
      expect(sentKeys).toEqual([k1, k2].sort());
      // k1 (the imageUrl/imageUrls[0] overlap) must still be sent once, not twice.
      expect(deleteFiles.mock.calls.filter((c) => c[0][0] === k1)).toHaveLength(1);
    });

    it("does not delete an image from storage while another post still references it", async () => {
      const user = await createUser();
      const shared = key();
      const sharedUrl = `https://utfs.io/f/${shared}`;

      const postToDelete = await prisma.post.create({
        data: { authorId: user.id, content: "post A", imageUrl: sharedUrl, imageUrls: [sharedUrl] },
      });
      const postToKeep = await prisma.post.create({
        data: { authorId: user.id, content: "post B", imageUrl: sharedUrl, imageUrls: [sharedUrl] },
      });
      postIds.push(postToDelete.id, postToKeep.id);

      const res = await DELETE(delReq(), params(postToDelete.id));
      expect(res.status).toBe(200);

      // postToKeep still references the same file - it must never reach UploadThing.
      expect(deleteFiles).not.toHaveBeenCalled();

      const stillThere = await prisma.post.findUnique({ where: { id: postToKeep.id } });
      expect(stillThere?.imageUrl).toBe(sharedUrl);
    });
  }
);
