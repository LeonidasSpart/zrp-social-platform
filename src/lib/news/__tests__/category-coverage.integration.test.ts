import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { NewsArticleCategory } from "@prisma/client";
import { measureCategoryCoverage } from "../pipeline";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const db = prisma;
const NOW = new Date("2026-02-03T12:00:00Z");

/*
 * Every hourly cycle reports how fresh each ZRP News category is, so
 * a starved category is visible in the run's own output rather than
 * only to a reader who opens the site. This is that measurement
 * against a real database.
 */
describe.skipIf(!hasRealDatabaseUrl)("category coverage (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  let authorId: string;

  beforeAll(async () => {
    const author = await db.user.create({
      data: {
        username: `zrp_cov_${suffix}`,
        email: `cov-${suffix}@zrp-news.invalid`,
        name: "Coverage Fixture",
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

  async function article(
    category: NewsArticleCategory,
    publishedAt: Date,
    status: "PUBLISHED" | "DRAFT" = "PUBLISHED"
  ) {
    await db.newsArticle.create({
      data: {
        title: `Fixture ${category} ${randomUUID().slice(0, 6)}`,
        slug: `fixture-${category.toLowerCase()}-${randomUUID().slice(0, 8)}`,
        content: "Fixture body.",
        category,
        status,
        authorId,
        publishedAt,
      },
    });
  }

  it("reports every category, including the ones with nothing at all", async () => {
    const coverage = await measureCategoryCoverage(db, NOW);

    for (const category of Object.values(NewsArticleCategory)) {
      expect(coverage).toHaveProperty(category);
    }
  });

  it("reports the age of the newest article in a category, in hours", async () => {
    await article("SPORTS", new Date(NOW.getTime() - 3 * 3600 * 1000));
    // The newer one is what a reader sees, so it is what gets reported.
    await article("SPORTS", new Date(NOW.getTime() - 30 * 60 * 1000));

    const coverage = await measureCategoryCoverage(db, NOW);
    expect(coverage.SPORTS).toBe(0.5);
  });

  it("reports null for a category with no published article, rather than pretending", async () => {
    const coverage = await measureCategoryCoverage(db, NOW);
    expect(coverage.GAMING).toBeNull();
  });

  it("ignores drafts, because a reader cannot see them", async () => {
    await article("CRYPTO", new Date(NOW.getTime() - 60 * 60 * 1000), "DRAFT");

    const coverage = await measureCategoryCoverage(db, NOW);
    expect(coverage.CRYPTO).toBeNull();
  });

  it("distinguishes a fresh category from a stale one", async () => {
    await article("POLITICS", new Date(NOW.getTime() - 45 * 60 * 1000));
    await article("SCIENCE", new Date(NOW.getTime() - 26 * 3600 * 1000));

    const coverage = await measureCategoryCoverage(db, NOW);
    expect(coverage.POLITICS).toBeLessThanOrEqual(1);
    expect(coverage.SCIENCE).toBeGreaterThan(24);
  });
});
