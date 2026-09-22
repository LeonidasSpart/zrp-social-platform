import type { Metadata } from "next";

// Single source of truth for these - src/app/post/[id]/layout.tsx and
// src/app/news/[slug]/page.tsx each used to hardcode their own copy of
// SITE_URL, which could silently drift from the root layout's if the
// domain ever changed. Every file in src/app that builds an absolute
// URL for openGraph.url/canonical should import these instead.
export const SITE_URL = "https://zrp.one";
export const SITE_NAME = "ZRP Social";
export const TWITTER_HANDLE = "@zrp_social";

/**
 * URL for this page's branded default social-preview image
 * (src/app/api/og/route.tsx), used whenever a page has no real content
 * image of its own (a listing photo, a post image, a user's avatar...).
 * Every section gets a distinct, on-brand image built from its own
 * title/subtitle instead of one generic image reused everywhere.
 */
export function defaultOgImageUrl(title: string, subtitle?: string): string {
  const params = new URLSearchParams({ title });
  if (subtitle) params.set("subtitle", subtitle);
  return `${SITE_URL}/api/og?${params.toString()}`;
}

interface OgImageOptions {
  image?: string | null;
  title: string;
  subtitle?: string;
  alt?: string;
}

type OgImage = { url: string; width: number; height: number; alt: string };

/**
 * THE single place that decides "use the real image" vs "fall back to
 * a branded default" for an openGraph/twitter images array - the actual
 * bug this module exists to prevent recurring.
 *
 * Next.js's Metadata API does not deep-merge openGraph/twitter objects
 * across nested route segments: a page that defines its own openGraph
 * without an `images` field does not inherit the root layout's
 * og-image.png, it loses it entirely (the whole openGraph object is
 * replaced, not merged). The confirmed production bug on /ambassadors,
 * and the same pattern found repeated across every other public route
 * that defines its own openGraph/twitter block, was exactly this: no
 * `images` field, and therefore no image at all in a link's social
 * preview. Every openGraph.images / twitter.images in this codebase
 * must go through this function so that can never happen silently
 * again - it always returns at least one image.
 */
export function resolveOgImages({ image, title, subtitle, alt }: OgImageOptions): OgImage[] {
  const url = image || defaultOgImageUrl(title, subtitle);
  return [{ url, width: 1200, height: 630, alt: alt || title }];
}

interface SocialMetadataOptions {
  /** openGraph/twitter title - may differ slightly from the page <title>. */
  title: string;
  description: string;
  /** Canonical/OG path, e.g. "/about" (relative - resolved via metadataBase). */
  path: string;
  /** A real content image for this specific page/entity, if one exists. */
  image?: string | null;
  imageAlt?: string;
  type?: "website" | "article" | "profile";
}

/**
 * Builds a page's openGraph + twitter metadata as one consistent unit -
 * reusable across every static public marketing/legal page in src/app
 * so a new page can't accidentally ship without a real social preview
 * image, and so siteName/locale/twitter:creator/card type never drift
 * page to page. Spread the result into a route's `metadata` export
 * alongside its own title/description/alternates:
 *
 *   export const metadata: Metadata = {
 *     title: "About Us",
 *     description: "...",
 *     alternates: { canonical: "/about" },
 *     ...buildSocialMetadata({ title: "About ZRP Social", description: "...", path: "/about" }),
 *   };
 *
 * Dynamic, DB-backed routes (profile, post, news article, ...) that
 * need article-specific fields (publishedTime, authors, a not-found/
 * private-entity branch) build their own openGraph/twitter objects
 * directly, but must still call resolveOgImages() for the images array
 * rather than hand-rolling an `images: x ? [...] : undefined` fallback.
 */
export function buildSocialMetadata({
  title,
  description,
  path,
  image,
  imageAlt,
  type = "website",
}: SocialMetadataOptions): Pick<Metadata, "openGraph" | "twitter"> {
  const url = `${SITE_URL}${path}`;
  const images = resolveOgImages({ image, title, subtitle: description, alt: imageAlt });

  return {
    openGraph: {
      type,
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      images,
    } as Metadata["openGraph"],
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((img) => img.url),
      creator: TWITTER_HANDLE,
    },
  };
}
