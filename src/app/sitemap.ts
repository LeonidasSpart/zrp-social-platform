import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

const baseUrl = "https://zrp.one";

// Force this to run at request time, not during `next build` - the build
// environment has no database access (only the production runtime does),
// so a build-time attempt to prerender this route fails outright.
export const dynamic = "force-dynamic";

// Regenerate at most once an hour - the sitemap doesn't need to reflect
// every single post/article the instant it's published, and a hard cap
// keeps this cheap even as the platform's content grows.
export const revalidate = 3600;

// Caps keep generation fast and the sitemap file a reasonable size even
// on a large, growing platform. Older content remains crawlable via
// normal link-following from newer pages and profiles; it just isn't
// listed explicitly here.
const MAX_ARTICLES = 1000;
const MAX_PROFILES = 5000;
const MAX_POSTS = 2000;

const STATIC_PAGES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/news", changeFrequency: "hourly", priority: 0.9 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
  { path: "/help", changeFrequency: "monthly", priority: 0.7 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.6 },
  { path: "/careers", changeFrequency: "weekly", priority: 0.5 },
  { path: "/charity", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "/investors", changeFrequency: "monthly", priority: 0.4 },
  { path: "/press", changeFrequency: "monthly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/login", changeFrequency: "yearly", priority: 0.3 },
  { path: "/signup", changeFrequency: "yearly", priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((page) => ({
    url: `${baseUrl}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  const [articles, profiles, posts] = await Promise.all([
    prisma.newsArticle.findMany({
      where: { status: "PUBLISHED", publishedAt: { not: null } },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
      take: MAX_ARTICLES,
    }),
    prisma.user.findMany({
      where: { isPrivate: false, banned: false },
      select: { username: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_PROFILES,
    }),
    prisma.post.findMany({
      where: {
        status: "published",
        premiumPost: null,
        author: { isPrivate: false, banned: false },
      },
      select: { id: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
      take: MAX_POSTS,
    }),
  ]);

  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${baseUrl}/news/${article.slug}`,
    lastModified: article.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const profileEntries: MetadataRoute.Sitemap = profiles.map((profile) => ({
    url: `${baseUrl}/profile/${profile.username}`,
    lastModified: profile.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${baseUrl}/post/${post.id}`,
    lastModified: post.updatedAt,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  return [
    ...staticEntries,
    ...articleEntries,
    ...profileEntries,
    ...postEntries,
  ];
}
