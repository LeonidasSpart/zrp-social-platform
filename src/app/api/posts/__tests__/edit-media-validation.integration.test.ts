import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { PUT } from "../[id]/route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function putReq(body: Record<string, unknown>) {
  return new NextRequest("https://zrp.one/x", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const BAD_URLS = [
  "https://evil.example/payload.jpg",
  "http://utfs.io/f/plain.jpg",
  "https://localhost/f/x.jpg",
  "https://127.0.0.1/f/x.jpg",
  "https://utfs.io@evil.example/f/x.jpg",
  "javascript:alert(1)",
  "data:image/png;base64,AAAA",
];
const GOOD_UPLOAD = "https://utfs.io/f/POSTEDITKEYaaaaaaaaaaaaaaaaaa";

/*
 * Regression coverage for the confirmed post-edit media-validation
 * bypass: POST /api/posts validates every image URL against the shared
 * allowlist (UploadThing uploads, the GIPHY picker - see
 * src/lib/media-url.ts) before accepting it; PUT /api/posts/[id] never
 * did, so a direct API call could set an existing post's image to any
 * attacker-chosen URL even though the identical value would be rejected
 * on creation.
 */
describe.skipIf(!hasRealDatabaseUrl)(
  "PUT /api/posts/[id] - media URL validation (integration, real Postgres)",
  () => {
    const userIds: string[] = [];
    const postIds: string[] = [];

    afterAll(async () => {
      await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createUserWithPost(imageUrl: string | null = null) {
      const user = await prisma.user.create({
        data: {
          email: `posteditmedia-${randomUUID().slice(0, 8)}@posttest.example`,
          username: `posteditmedia${randomUUID().slice(0, 6)}`,
          password: "x",
          role: "USER",
          plan: "free",
        },
      });
      userIds.push(user.id);
      const post = await prisma.post.create({
        data: { authorId: user.id, content: "original content", imageUrl },
      });
      postIds.push(post.id);
      getServerSession.mockResolvedValue({ user: { id: user.id } });
      return { user, post };
    }

    it("rejects every untrusted imageUrl on edit, the same as creation would", async () => {
      const { post } = await createUserWithPost();
      for (const bad of BAD_URLS) {
        const res = await PUT(putReq({ content: "edited", imageUrl: bad }), params(post.id));
        expect(res.status, `expected ${bad} to be rejected`).toBe(400);
      }
      const stored = await prisma.post.findUnique({ where: { id: post.id } });
      expect(stored?.imageUrl).toBeNull();
      expect(stored?.content).toBe("original content");
    });

    it("accepts a real UploadThing URL on edit", async () => {
      const { post } = await createUserWithPost();
      const res = await PUT(putReq({ content: "edited", imageUrl: GOOD_UPLOAD }), params(post.id));
      expect(res.status).toBe(200);
      const stored = await prisma.post.findUnique({ where: { id: post.id } });
      expect(stored?.imageUrl).toBe(GOOD_UPLOAD);
    });

    it("a text-only edit that omits imageUrl entirely leaves the existing image untouched (no regression)", async () => {
      const { post } = await createUserWithPost(GOOD_UPLOAD);
      const res = await PUT(putReq({ content: "edited text only" }), params(post.id));
      expect(res.status).toBe(200);
      const stored = await prisma.post.findUnique({ where: { id: post.id } });
      expect(stored?.imageUrl).toBe(GOOD_UPLOAD);
      expect(stored?.content).toBe("edited text only");
    });

    it("explicitly clearing the image (imageUrl: null) still works without needing to pass the allowlist", async () => {
      const { post } = await createUserWithPost(GOOD_UPLOAD);
      const res = await PUT(putReq({ content: "edited", imageUrl: null }), params(post.id));
      expect(res.status).toBe(200);
      const stored = await prisma.post.findUnique({ where: { id: post.id } });
      expect(stored?.imageUrl).toBeNull();
    });

    it("another user cannot edit someone else's post (ownership check still enforced)", async () => {
      const { post } = await createUserWithPost();
      const attacker = await prisma.user.create({
        data: {
          email: `attacker-${randomUUID().slice(0, 8)}@posttest.example`,
          username: `attacker${randomUUID().slice(0, 6)}`,
          password: "x",
        },
      });
      userIds.push(attacker.id);
      getServerSession.mockResolvedValue({ user: { id: attacker.id } });
      const res = await PUT(putReq({ content: "hijacked", imageUrl: GOOD_UPLOAD }), params(post.id));
      expect(res.status).toBe(403);
    });
  }
);
