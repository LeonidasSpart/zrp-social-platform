import { describe, it, expect, vi, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));

import { POST as createArticle } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function jsonReq(body: unknown) {
  return new NextRequest("https://zrp.one/api/journalist/articles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ⚠️ REGRESSION (master audit): coverImage is rendered as a raw <img
// src> on the public article page (and fed into OG/JSON-LD meta tags),
// but unlike every other content-writing route in the codebase this one
// never validated it through media-url.ts, letting any journalist point
// it at an attacker-controlled URL.
describe.skipIf(!hasRealDatabaseUrl)(
  "POST /api/journalist/articles - coverImage media validation (integration, real Postgres)",
  () => {
    const suffix = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const slugs: string[] = [];

    afterAll(async () => {
      await prisma.newsArticle.deleteMany({ where: { slug: { in: slugs } } });
      await prisma.journalistProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    });

    async function createJournalist(status: "PENDING" | "VERIFIED" = "VERIFIED") {
      const user = await prisma.user.create({
        data: {
          email: `journalist-${randomUUID().slice(0, 8)}@journotest.example`,
          username: `jrn${randomUUID().slice(0, 8)}`,
          password: "x",
          role: "JOURNALIST",
        },
      });
      userIds.push(user.id);
      await prisma.journalistProfile.create({ data: { userId: user.id, status } });
      getServerSession.mockResolvedValue({ user: { id: user.id } });
      return user;
    }

    const base = { title: "Test Article", content: "Some article body." };

    it("rejects an untrusted coverImage URL", async () => {
      await createJournalist();
      const slug = `journo-bad-cover-${suffix}`;
      slugs.push(slug);
      const res = await createArticle(
        jsonReq({ ...base, slug, coverImage: "https://evil.example/tracking.jpg" })
      );
      expect(res.status).toBe(400);
      expect(await prisma.newsArticle.findUnique({ where: { slug } })).toBeNull();
    });

    it("rejects a javascript: coverImage URL", async () => {
      await createJournalist();
      const slug = `journo-js-cover-${suffix}`;
      slugs.push(slug);
      const res = await createArticle(
        jsonReq({ ...base, slug, coverImage: "javascript:alert(1)" })
      );
      expect(res.status).toBe(400);
    });

    it("accepts an article with no coverImage", async () => {
      await createJournalist();
      const slug = `journo-no-cover-${suffix}`;
      slugs.push(slug);
      const res = await createArticle(jsonReq({ ...base, slug }));
      expect(res.status).toBe(201);
      const { article } = await res.json();
      expect(article.coverImage).toBeNull();
    });

    it("accepts a trusted UploadThing coverImage URL", async () => {
      await createJournalist();
      const slug = `journo-good-cover-${suffix}`;
      slugs.push(slug);
      const res = await createArticle(
        jsonReq({ ...base, slug, coverImage: "https://utfs.io/f/JOURNOCOVERKEYaaaaaaaaaaaaaa" })
      );
      expect(res.status).toBe(201);
      const { article } = await res.json();
      expect(article.coverImage).toBe("https://utfs.io/f/JOURNOCOVERKEYaaaaaaaaaaaaaa");
    });
  }
);
