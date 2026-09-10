import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { NewsArticleCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GET } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const db = prisma;

/*
 * The last link in the ZRP News chain: a published article in the
 * database has to actually come back from /api/news, under the right
 * category, for the category page to show anything at all.
 *
 * This drives the real route handler against a real database - no
 * mocked Prisma - so a regression in the query, the status filter or
 * the category filter fails here rather than as an empty category on
 * the live site.
 */
describe.skipIf(!hasRealDatabaseUrl)("GET /api/news (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  let authorId: string;

  async function call(query: string) {
    const response = await GET(new NextRequest(`http://localhost/api/news${query}`));
    return { status: response.status, body: await response.json() };
  }

  async function article(params: {
    category: "WORLD" | "SPORTS" | "GAMING" | "CRYPTO";
    status?: "PUBLISHED" | "DRAFT";
    publishedAt?: Date | null;
    title?: string;
  }) {
    return db.newsArticle.create({
      data: {
        title: params.title ?? `Fixture ${params.category} ${randomUUID().slice(0, 6)}`,
        slug: `fixture-${randomUUID().slice(0, 10)}`,
        content: "Fixture body.",
        category: params.category,
        status: params.status ?? "PUBLISHED",
        authorId,
        publishedAt: params.publishedAt === undefined ? new Date() : params.publishedAt,
      },
    });
  }

  /** Only the fixtures this test created, ignoring any real articles. */
  function mine(body: { articles?: Array<{ authorId?: string; author?: { id: string } }> }) {
    return (body.articles ?? []).filter((a) => a.author?.id === authorId);
  }

  beforeAll(async () => {
    const author = await db.user.create({
      data: {
        username: `zrp_api_${suffix}`,
        email: `api-${suffix}@zrp-news.invalid`,
        name: "News API Fixture",
      },
      select: { id: true },
    });
    authorId = author.id;
  });

  afterAll(async () => {
    if (!hasRealDatabaseUrl) return;
    await db.newsArticle.deleteMany({ where: { authorId } });
    await db.user.deleteMany({ where: { id: authorId } });
  });

  beforeEach(async () => {
    await db.newsArticle.deleteMany({ where: { authorId } });
  });

  it("returns a published article", async () => {
    await article({ category: "SPORTS", title: `Sports fixture ${suffix}` });

    const { status, body } = await call("?limit=50");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(mine(body).length).toBe(1);
  });

  it("filters to the requested category, which is what each category page does", async () => {
    await article({ category: "SPORTS" });
    await article({ category: "GAMING" });

    const sports = await call("?category=SPORTS&limit=50");
    const gaming = await call("?category=GAMING&limit=50");

    expect(mine(sports.body).length).toBe(1);
    expect(mine(gaming.body).length).toBe(1);
    // Nothing leaks across categories.
    for (const a of mine(sports.body) as Array<{ category: string }>) {
      expect(a.category).toBe("SPORTS");
    }
  });

  it("never serves a draft, however recently it was touched", async () => {
    await article({ category: "CRYPTO", status: "DRAFT" });

    const { body } = await call("?category=CRYPTO&limit=50");
    expect(mine(body).length).toBe(0);
  });

  it("never serves a published row with no publication date", async () => {
    await article({ category: "CRYPTO", publishedAt: null });

    const { body } = await call("?category=CRYPTO&limit=50");
    expect(mine(body).length).toBe(0);
  });

  it("serves the newest article first, so a category page leads with fresh news", async () => {
    const older = await article({
      category: "GAMING",
      publishedAt: new Date(Date.now() - 6 * 3600 * 1000),
    });
    const newer = await article({
      category: "GAMING",
      publishedAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    const { body } = await call("?category=GAMING&limit=50");
    const ids = (mine(body) as Array<{ id: string }>).map((a) => a.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });

  it("rejects a category that does not exist rather than silently returning everything", async () => {
    const { status, body } = await call("?category=NOT_A_CATEGORY");
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it("accepts the lowercase category a URL might carry", async () => {
    await article({ category: "SPORTS" });

    const { status, body } = await call("?category=sports&limit=50");
    expect(status).toBe(200);
    expect(mine(body).length).toBe(1);
  });
});

/*
 * The /news page keeps its own hand-written list of category tabs, and
 * sends each value straight to this route, which rejects anything that
 * is not a NewsArticleCategory. If the two ever drift, the tab does not
 * come back empty - it 400s - so the contract is worth pinning even
 * though no database is involved.
 */
describe("the /news category tabs match the categories the API accepts", () => {
  const PAGE = fs.readFileSync(
    path.join(process.cwd(), "src/app/news/page.tsx"),
    "utf-8"
  );

  /** The `value:` entries of the page's `categories` array. */
  function tabValues(): string[] {
    const block = PAGE.match(/const categories:[\s\S]*?\n\];/);
    expect(block, "the /news page no longer declares a categories array").not.toBeNull();

    const pattern = /value:\s*"([A-Z_]+)"/g;
    const found: string[] = [];
    let match = pattern.exec(block![0]);
    while (match !== null) {
      found.push(match[1]);
      match = pattern.exec(block![0]);
    }
    return found;
  }

  it("offers no tab the API would reject with a 400", () => {
    const allowed = new Set<string>([...Object.values(NewsArticleCategory), "ALL"]);
    for (const value of tabValues()) {
      expect(allowed.has(value), `the /news page offers a "${value}" tab the API rejects`).toBe(true);
    }
  });

  it("leaves no category unreachable from the page", () => {
    const tabs = new Set(tabValues());
    for (const category of Object.values(NewsArticleCategory)) {
      expect(tabs.has(category), `${category} articles can be published but never browsed`).toBe(true);
    }
  });
});
