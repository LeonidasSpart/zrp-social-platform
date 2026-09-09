import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireAdmin, logAdminAction, uploadFiles } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  logAdminAction: vi.fn(),
  uploadFiles: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));
vi.mock("uploadthing/server", () => ({
  UTApi: vi.fn().mockImplementation(function UTApiMock(this: { uploadFiles: typeof uploadFiles }) {
    this.uploadFiles = uploadFiles;
  }),
}));

import { prisma } from "@/lib/db";
import { provisionFeeds } from "@/lib/news/feeds";
import { PATCH } from "../[id]/route";

/*
 * The editorial feed accounts this route manages are deliberately
 * created with no password (see feeds.ts), so they can never sign in
 * and use the ordinary self-service /api/user/update-avatar or
 * /update-cover routes. This is the only way their avatar/cover can
 * ever be changed - so it has to actually work, admin-gated and
 * audited, without needing a session for the target account.
 */
const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const db = prisma;

describe.skipIf(!hasRealDatabaseUrl)("admin feed image upload (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const feedKey = `test-feed-image-${suffix}`;
  let feedId: string;
  let userId: string;

  function call(body: FormData | Record<string, unknown>) {
    const request =
      body instanceof FormData
        ? new NextRequest(`https://zrp.one/api/admin/news-network/feeds/${feedId}`, { method: "PATCH", body })
        : new NextRequest(`https://zrp.one/api/admin/news-network/feeds/${feedId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
    return PATCH(request, { params: Promise.resolve({ id: feedId }) });
  }

  beforeAll(async () => {
    requireAdmin.mockResolvedValue({ authorized: true, session: { user: { id: "admin-1", username: "admin" } } });

    await provisionFeeds(db, [
      {
        key: feedKey,
        username: `zrp_img_test_${suffix}`,
        displayName: "ZRP Image Test Desk",
        description: "Official ZRP editorial feed · automated. Test fixture.",
        region: "GLOBAL",
        country: null,
        language: "en",
        timezone: "UTC",
        topics: [],
        isPilot: false,
        minMinutesBetweenPosts: 180,
        maxPostsPerDay: 6,
      },
    ]);

    const feed = await db.newsFeed.findUniqueOrThrow({ where: { key: feedKey } });
    feedId = feed.id;
    userId = feed.userId;
  });

  beforeEach(() => {
    uploadFiles.mockClear();
  });

  afterAll(async () => {
    if (!hasRealDatabaseUrl) return;
    await db.newsFeed.deleteMany({ where: { id: feedId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("returns 401 when the caller is not an admin", async () => {
    requireAdmin.mockResolvedValueOnce({
      authorized: false,
      response: new Response(null, { status: 401 }) as unknown as ReturnType<typeof Response.json>,
    });

    const formData = new FormData();
    formData.append("avatarFile", new File(["x"], "avatar.png", { type: "image/png" }));
    const res = await call(formData);
    expect(res.status).toBe(401);
  });

  it("uploads a real file through UTApi and sets the editorial account's avatarUrl - the only way to change it, since it has no password to sign in with", async () => {
    uploadFiles.mockResolvedValueOnce({ data: { ufsUrl: "https://utfs.io/f/test-avatar" }, error: null });

    const formData = new FormData();
    formData.append("avatarFile", new File(["fake-image-bytes"], "avatar.png", { type: "image/png" }));

    const res = await call(formData);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user.avatarUrl).toBe("https://utfs.io/f/test-avatar");
    expect(uploadFiles).toHaveBeenCalledOnce();

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.avatarUrl).toBe("https://utfs.io/f/test-avatar");

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "news_network.feed_avatar_update" })
    );
  });

  it("uploads a cover file and sets coverUrl, independently of avatarUrl", async () => {
    uploadFiles.mockResolvedValueOnce({ data: { ufsUrl: "https://utfs.io/f/test-cover" }, error: null });

    const formData = new FormData();
    formData.append("coverFile", new File(["fake-image-bytes"], "cover.png", { type: "image/png" }));

    const res = await call(formData);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.coverUrl).toBe("https://utfs.io/f/test-cover");

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coverUrl).toBe("https://utfs.io/f/test-cover");
    // The earlier avatar upload must survive - each field updates independently.
    expect(user.avatarUrl).toBe("https://utfs.io/f/test-avatar");
  });

  it("rejects a non-image file type without ever calling UTApi", async () => {
    const formData = new FormData();
    formData.append("avatarFile", new File(["not an image"], "file.txt", { type: "text/plain" }));

    const res = await call(formData);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it("rejects a file over 5MB without ever calling UTApi", async () => {
    const formData = new FormData();
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    formData.append("avatarFile", new File([big], "big.png", { type: "image/png" }));

    const res = await call(formData);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it("reports a failed UTApi upload rather than silently leaving the old image", async () => {
    uploadFiles.mockResolvedValueOnce({ data: null, error: { message: "upstream unavailable" } });

    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const formData = new FormData();
    formData.append("avatarFile", new File(["fake-image-bytes"], "avatar.png", { type: "image/png" }));

    const res = await call(formData);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.success).toBe(false);

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.avatarUrl).toBe(before.avatarUrl);
  });

  it("returns 404 for a feed id that does not exist, without touching any real user", async () => {
    const formData = new FormData();
    formData.append("avatarFile", new File(["fake-image-bytes"], "avatar.png", { type: "image/png" }));

    const res = await PATCH(
      new NextRequest("https://zrp.one/api/admin/news-network/feeds/does-not-exist", {
        method: "PATCH",
        body: formData,
      }),
      { params: Promise.resolve({ id: "does-not-exist" }) }
    );

    expect(res.status).toBe(404);
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it("still supports the existing JSON enable/disable behaviour unchanged", async () => {
    const res = await call({ enabled: false });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.feed.enabled).toBe(false);

    const feed = await db.newsFeed.findUniqueOrThrow({ where: { id: feedId } });
    expect(feed.enabled).toBe(false);

    await db.newsFeed.update({ where: { id: feedId }, data: { enabled: true } });
  });
});
