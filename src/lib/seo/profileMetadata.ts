import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE, resolveOgImages } from "@/lib/seo/metadata";

/**
 * Builds <head> metadata for a public profile page.
 *
 * Private and banned accounts deliberately get a minimal, non-revealing
 * title/description and are marked noindex - matching the data-minimization
 * approach already used by the profile API route, extended to search
 * engines.
 */
export async function buildProfileMetadata(
  usernameParam: string,
  canonicalPath: string
): Promise<Metadata> {
  const cleanUsername = usernameParam.replace(/^@/, "");

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: cleanUsername, mode: "insensitive" } },
        { customUrl: { equals: cleanUsername, mode: "insensitive" } },
      ],
    },
    select: {
      username: true,
      name: true,
      bio: true,
      avatarUrl: true,
      isPrivate: true,
      banned: true,
    },
  });

  if (!user || user.banned) {
    return {
      title: "Profile Not Found",
      robots: { index: false, follow: false },
    };
  }

  const displayName = user.name || user.username;

  if (user.isPrivate) {
    return {
      title: `${displayName} (@${user.username})`,
      description: "This account is private on ZRP Social.",
      alternates: { canonical: canonicalPath },
      robots: { index: false, follow: false },
    };
  }

  const description = user.bio
    ? user.bio.slice(0, 200)
    : `View @${user.username}'s profile on ZRP Social.`;

  const url = `${SITE_URL}${canonicalPath}`;

  return {
    title: `${displayName} (@${user.username})`,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "profile",
      title: `${displayName} (@${user.username})`,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      username: user.username,
      images: resolveOgImages({
        image: user.avatarUrl,
        title: `${displayName} (@${user.username})`,
        subtitle: description,
        alt: displayName,
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayName} (@${user.username})`,
      description,
      creator: TWITTER_HANDLE,
      images: resolveOgImages({
        image: user.avatarUrl,
        title: `${displayName} (@${user.username})`,
        subtitle: description,
        alt: displayName,
      }).map((img) => img.url),
    },
  };
}
