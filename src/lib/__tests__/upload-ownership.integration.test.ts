import { describe, it, expect, vi, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../db";

const { deleteUploadThingKeys } = vi.hoisted(() => ({
  deleteUploadThingKeys: vi.fn(async (keys: string[]) => ({ requested: keys.length, deleted: keys.length })),
}));
vi.mock("../uploadthing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../uploadthing")>();
  return { ...actual, deleteUploadThingKeys };
});

import { deleteUploadsIfUnreferenced, isUploadKeyReferenced } from "../upload-ownership";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const key = () => `K${randomUUID().replace(/-/g, "")}`;

describe.skipIf(!hasRealDatabaseUrl)("upload ownership guard (integration, real Postgres)", () => {
  const userIds: string[] = [];

  async function createUser(overrides: Record<string, unknown> = {}) {
    const user = await prisma.user.create({
      data: {
        email: `own-${randomUUID().slice(0, 8)}@mediatest.example`,
        username: `own${randomUUID().slice(0, 8)}`,
        password: "$2a$10$ownershiptestplaceholderhash0000000000000000000000",
        role: "USER",
        ...overrides,
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.message.deleteMany({ where: { senderId: { in: userIds } } });
    await prisma.story.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("finds a key referenced by any host/path form in text columns", async () => {
    const k1 = key(); const k2 = key(); const k3 = key(); const k4 = key();
    const user = await createUser({ avatarUrl: `https://utfs.io/f/${k1}` });
    await prisma.post.create({ data: { authorId: user.id, content: "p", imageUrl: `https://zrp1abc.ufs.sh/a/zrp1abc/${k2}` } });
    await prisma.message.create({ data: { senderId: user.id, receiverId: user.id, content: "m", imageUrl: `https://utfs.io/f/${k3}` } });
    await prisma.story.create({ data: { userId: user.id, mediaUrl: `https://utfs.io/f/${k4}`, mediaType: "image", expiresAt: new Date(Date.now() + 60_000) } });
    for (const k of [k1, k2, k3, k4]) expect(await isUploadKeyReferenced(k), k).toBe(true);
    expect(await isUploadKeyReferenced(key())).toBe(false);
  });

  it("finds a key referenced inside String[] columns", async () => {
    const k = key();
    const user = await createUser();
    await prisma.post.create({ data: { authorId: user.id, content: "p", imageUrls: [`https://utfs.io/f/other`, `https://utfs.io/f/${k}`] } });
    expect(await isUploadKeyReferenced(k)).toBe(true);
  });

  it("deleteUploadsIfUnreferenced deletes only unreferenced keys, accepting URLs or raw keys, de-duplicated", async () => {
    const referenced = key(); const orphan = key();
    const user = await createUser();
    await prisma.post.create({ data: { authorId: user.id, content: "p", imageUrl: `https://utfs.io/f/${referenced}` } });

    deleteUploadThingKeys.mockClear();
    const result = await deleteUploadsIfUnreferenced([
      `https://utfs.io/f/${referenced}`,
      referenced,
      `https://zrp1abc.ufs.sh/f/${orphan}`,
      orphan,
      null,
      undefined,
      "",
    ]);
    expect(result.kept).toEqual([referenced]);
    expect(result.deleted).toEqual([orphan]);
    expect(deleteUploadThingKeys).toHaveBeenCalledTimes(1);
    expect(deleteUploadThingKeys).toHaveBeenCalledWith([orphan]);
  });

  it("an empty or all-referenced list never calls storage", async () => {
    deleteUploadThingKeys.mockClear();
    expect(await deleteUploadsIfUnreferenced([null, ""])).toEqual({ deleted: [], kept: [] });
    expect(deleteUploadThingKeys).not.toHaveBeenCalled();
  });
});
