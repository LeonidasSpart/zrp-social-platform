import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getVerifiedToken, getServerSession, deleteUploadThingKeys } = vi.hoisted(() => ({
  getVerifiedToken: vi.fn(),
  getServerSession: vi.fn(),
  deleteUploadThingKeys: vi.fn(async (keys: string[]) => ({ requested: keys.length, deleted: keys.length })),
}));
vi.mock("@/lib/auth-guards", () => ({ getVerifiedToken }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/uploadthing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/uploadthing")>();
  return { ...actual, deleteUploadThingKeys, deleteUploadThingFiles: vi.fn() };
});

import { POST as createListing } from "../route";
import { PUT as updateListing, DELETE as deleteListing } from "../[id]/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Each request gets its own client IP so the per-IP create limiter
// (10/hour) never trips across the many calls below.
let ipCounter = 1;
function jsonReq(url: string, method: string, body: unknown) {
  ipCounter += 1;
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.7` },
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const GOOD_IMG = "https://zrp1abc.ufs.sh/f/LISTIMGKEYaaaaaaaaaaaaaaaaaa";
const GOOD_IMG2 = "https://utfs.io/f/LISTIMGKEYbbbbbbbbbbbbbbbbbb";
const GOOD_VIDEO = "https://zrp1abc.ufs.sh/f/LISTVIDKEYcccccccccccccccccc";
const BAD_URLS = [
  "https://evil.example/car.jpg",
  "http://utfs.io/f/plain.jpg",
  "https://localhost/f/x.jpg",
  "https://127.0.0.1/f/x.jpg",
  "https://172.16.0.9/f/x.jpg",
  "https://169.254.169.254/latest",
  "https://[::1]/f/x.jpg",
  "file:///etc/passwd",
  "data:image/png;base64,AAAA",
  "javascript:alert(1)",
  "https://utfs.io.evil.example/f/x.jpg",
  "https://utfs.io@evil.example/f/x.jpg",
  "//utfs.io/f/x.jpg",
  "garbage",
];
const base = { category: "OTHER_LUXURY", title: "Watch", description: "A fine watch.", price: 100 };

describe.skipIf(!hasRealDatabaseUrl)("Marketplace listing media trust + storage ownership (integration, real Postgres)", () => {
  const userIds: string[] = [];

  async function createUser(label = "seller") {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@mediatest.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "$2a$10$listingtestplaceholderhash00000000000000000000000000",
        role: "USER",
      },
    });
    userIds.push(user.id);
    return user;
  }
  const asUser = (id: string) => {
    getVerifiedToken.mockResolvedValue({ id, plan: "business" });
    getServerSession.mockResolvedValue({ user: { id } });
  };

  beforeEach(() => {
    deleteUploadThingKeys.mockClear();
  });

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.listing.deleteMany({ where: { sellerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("POST /api/listings accepts UploadThing photos and video", async () => {
    const user = await createUser();
    asUser(user.id);
    const res = (await createListing(jsonReq("https://zrp.one/api/listings", "POST", { ...base, imageUrls: [GOOD_IMG, GOOD_IMG2], videoUrl: GOOD_VIDEO })))!;
    expect(res.status).toBe(201);
    const { listing } = await res.json();
    expect(listing.imageUrls).toEqual([GOOD_IMG, GOOD_IMG2]);
    expect(listing.videoUrl).toBe(GOOD_VIDEO);
    expect(listing.status).toBe("PENDING_REVIEW");
  });

  it("POST /api/listings rejects any untrusted photo or video, even mixed in with trusted ones", async () => {
    const user = await createUser();
    asUser(user.id);
    for (const bad of BAD_URLS) {
      const r1 = (await createListing(jsonReq("https://zrp.one/api/listings", "POST", { ...base, imageUrls: [GOOD_IMG, bad] })))!;
      expect(r1.status, `image ${bad}`).toBe(400);
      const r2 = (await createListing(jsonReq("https://zrp.one/api/listings", "POST", { ...base, imageUrls: [GOOD_IMG], videoUrl: bad })))!;
      expect(r2.status, `video ${bad}`).toBe(400);
    }
    expect(await prisma.listing.count({ where: { sellerId: user.id } })).toBe(0);
  });

  it("PUT /api/listings/[id] rejects new untrusted media, accepts stored values re-sent, accepts new trusted media", async () => {
    const user = await createUser();
    asUser(user.id);
    const legacy = await prisma.listing.create({
      data: { ...base, sellerId: user.id, category: "OTHER_LUXURY", imageUrls: ["https://legacy-cdn.example/old.jpg"], status: "PENDING_REVIEW" },
    });
    // Edit form re-sends the existing photo with a new title: must keep working.
    const same = await updateListing(jsonReq("https://zrp.one/x", "PUT", { title: "Renamed", imageUrls: ["https://legacy-cdn.example/old.jpg"] }), params(legacy.id));
    expect(same.status).toBe(200);

    for (const bad of BAD_URLS) {
      const r = await updateListing(jsonReq("https://zrp.one/x", "PUT", { imageUrls: ["https://legacy-cdn.example/old.jpg", bad] }), params(legacy.id));
      expect(r.status, `image ${bad}`).toBe(400);
      const v = await updateListing(jsonReq("https://zrp.one/x", "PUT", { videoUrl: bad }), params(legacy.id));
      expect(v.status, `video ${bad}`).toBe(400);
    }

    const good = await updateListing(jsonReq("https://zrp.one/x", "PUT", { imageUrls: [GOOD_IMG], videoUrl: GOOD_VIDEO }), params(legacy.id));
    expect(good.status).toBe(200);
    const { listing } = await good.json();
    expect(listing.imageUrls).toEqual([GOOD_IMG]);
    expect(listing.videoUrl).toBe(GOOD_VIDEO);

    const cleared = await updateListing(jsonReq("https://zrp.one/x", "PUT", { videoUrl: null }), params(legacy.id));
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).listing.videoUrl).toBeNull();
  });

  it("another user cannot edit the listing at all", async () => {
    const owner = await createUser("owner");
    const listing = await prisma.listing.create({ data: { ...base, sellerId: owner.id, category: "OTHER_LUXURY", imageUrls: [GOOD_IMG], status: "ACTIVE" } });
    const other = await createUser("other");
    asUser(other.id);
    const res = await updateListing(jsonReq("https://zrp.one/x", "PUT", { imageUrls: [GOOD_IMG2] }), params(listing.id));
    expect(res.status).toBe(403);
  });

  it("DELETE /api/listings/[id] never deletes a storage file another record still references", async () => {
    const victim = await createUser("victim");
    const victimKey = `VICTIMLISTING${randomUUID().replace(/-/g, "")}`;
    await prisma.post.create({ data: { authorId: victim.id, content: "photo", imageUrls: [`https://utfs.io/f/${victimKey}`] } });

    const attacker = await createUser("attacker");
    const ownKey = `OWNLISTING${randomUUID().replace(/-/g, "")}`;
    const listing = await prisma.listing.create({
      data: {
        ...base, sellerId: attacker.id, category: "OTHER_LUXURY", status: "ACTIVE",
        imageUrls: [`https://zrp1abc.ufs.sh/f/${victimKey}`, `https://utfs.io/f/${ownKey}`],
      },
    });
    asUser(attacker.id);
    const res = await deleteListing(new NextRequest("https://zrp.one/x", { method: "DELETE" }), params(listing.id));
    expect(res.status).toBe(200);
    const deleted = deleteUploadThingKeys.mock.calls.flatMap((c) => c[0] as string[]);
    expect(deleted).not.toContain(victimKey);
    expect(deleted).toContain(ownKey);
  });
});
