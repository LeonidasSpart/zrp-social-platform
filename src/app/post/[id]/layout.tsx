import type { Metadata } from "next";
import { prisma } from "@/lib/db";

const SITE_URL = "https://zrp.one";

// Reads the DB at request time via generateMetadata - force dynamic
// rendering so `next build` never tries to run that query without a
// reachable database.
export const dynamic = "force-dynamic";

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id },
    select: {
      content: true,
      imageUrl: true,
      imageUrls: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      author: {
        select: {
          username: true,
          name: true,
          avatarUrl: true,
          isPrivate: true,
          banned: true,
        },
      },
      premiumPost: { select: { previewContent: true } },
    },
  });

  if (
    !post ||
    post.status !== "published" ||
    post.author.banned ||
    post.author.isPrivate
  ) {
    return {
      title: "Post",
      robots: { index: false, follow: false },
    };
  }

  const displayName = post.author.name || post.author.username;

  // Premium posts gate their real content behind a purchase - only the
  // creator-authored preview (or a generic fallback) is safe to surface
  // in search snippets and social previews.
  const bodyText = post.premiumPost
    ? post.premiumPost.previewContent || "Premium content on ZRP Social."
    : post.content;

  const description = truncate(bodyText, 160);
  const title = `${displayName}: "${truncate(bodyText, 60)}"`;
  const url = `${SITE_URL}/post/${id}`;
  const image = post.imageUrl || post.imageUrls?.[0] || post.author.avatarUrl;

  return {
    title,
    description,
    alternates: { canonical: `/post/${id}` },
    openGraph: {
      type: "article",
      title,
      description,
      url,
      publishedTime: post.createdAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default function PostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
