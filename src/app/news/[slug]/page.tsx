import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import T from "@/components/i18n/T";
import type { TranslationKey } from "@/lib/translations";

const CATEGORY_KEYS: Record<string, TranslationKey> = {
  WORLD: "newsCategory.world",
  EUROPE: "newsCategory.europe",
  SWITZERLAND: "newsCategory.switzerland",
  POLITICS: "newsCategory.politics",
  BUSINESS: "newsCategory.business",
  TECHNOLOGY: "newsCategory.technology",
  CRYPTO: "newsCategory.crypto",
  SCIENCE: "newsCategory.science",
  SPORTS: "newsCategory.sports",
  CULTURE: "newsCategory.culture",
  COMMUNITY: "newsCategory.community",
};

export const dynamic = "force-dynamic";

type NewsArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function NewsArticlePage({
  params,
}: NewsArticlePageProps) {
  const { slug } = await params;

  const article = await prisma.newsArticle.findUnique({
    where: {
      slug,
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
          badgeType: true,
        },
      },
    },
  });

  if (
    !article ||
    article.status !== "PUBLISHED" ||
    !article.publishedAt
  ) {
    notFound();
  }

  await prisma.newsArticle.update({
    where: {
      id: article.id,
    },
    data: {
      views: {
        increment: 1,
      },
    },
  });

  const publishedDate = article.publishedAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const publishedTime = article.publishedAt.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main className="min-h-screen bg-background">
      <article className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/news"
            className="inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← <T k="news.backToList" />
          </Link>
        </div>

        <header className="mb-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              <T k={CATEGORY_KEYS[article.category] ?? "newsCategory.world"} />
            </span>

            {article.featured && (
              <span className="rounded-full border border-red-600/30 bg-red-600/10 px-3 py-1 text-xs font-semibold text-red-600">
                <T k="news.featured" />
              </span>
            )}
          </div>

          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {article.title}
          </h1>

          {article.excerpt && (
            <p className="mt-5 text-lg leading-8 text-muted-foreground sm:text-xl">
              {article.excerpt}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              {article.author.avatarUrl ? (
                <img
                  src={article.author.avatarUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-semibold">
                  {(article.author.name ||
                    article.author.username ||
                    "Z")[0].toUpperCase()}
                </div>
              )}

              <div>
                <div className="font-medium text-foreground">
                  {article.author.name || article.author.username}
                  {article.author.badgeType && (
                    <span className="ml-1 text-red-600">✓</span>
                  )}
                </div>

                <div>@{article.author.username}</div>
              </div>
            </div>

            <span className="hidden sm:inline">•</span>

            <time dateTime={article.publishedAt.toISOString()}>
              {publishedDate} at {publishedTime}
            </time>

            <span className="hidden sm:inline">•</span>

            <span><T k="news.viewsCount" params={{ count: article.views + 1 }} /></span>
          </div>
        </header>

        {article.coverImage && (
          <div className="mb-8 overflow-hidden rounded-2xl border bg-muted">
            <img
              src={article.coverImage}
              alt={article.title}
              className="max-h-[600px] w-full object-cover"
            />
          </div>
        )}

        {article.sourceName && (
          <div className="mb-8 rounded-xl border bg-muted/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <T k="news.source" />
            </div>

            {article.sourceUrl ? (
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-medium text-red-600 hover:underline"
              >
                {article.sourceName}
              </a>
            ) : (
              <div className="mt-1 font-medium">
                {article.sourceName}
              </div>
            )}
          </div>
        )}

        <div className="prose prose-neutral max-w-none dark:prose-invert">
          {article.content.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line leading-8">
              {paragraph.trim()}
            </p>
          ))}
        </div>

        <footer className="mt-12 border-t pt-6">
          <Link
            href="/news"
            className="inline-flex items-center rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            ← <T k="news.moreNews" />
          </Link>
        </footer>
      </article>
    </main>
  );
}
