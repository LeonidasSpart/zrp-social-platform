import type { Metadata } from "next";
import { buildProfileMetadata } from "@/lib/seo/profileMetadata";
import { prisma } from "@/lib/db";

const SITE_URL = "https://zrp.one";

// This route reads the DB at request time (via generateMetadata below and
// the JSON-LD lookup in the layout body) - force dynamic rendering so
// Next.js never tries to run those queries during `next build`, when no
// database is reachable.
export const dynamic = "force-dynamic";

type ProfileLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return buildProfileMetadata(username, `/profile/${username}`);
}

export default async function ProfileLayout({
  children,
  params,
}: ProfileLayoutProps) {
  const { username } = await params;
  const cleanUsername = username.replace(/^@/, "");

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

  // Only emit structured data for public, active profiles - never for
  // private or banned accounts, matching the metadata rules above.
  if (!user || user.banned || user.isPrivate) {
    return <>{children}</>;
  }

  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: user.name || user.username,
      alternateName: user.username,
      description: user.bio || undefined,
      image: user.avatarUrl || undefined,
      url: `${SITE_URL}/profile/${user.username}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(profileJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {children}
    </>
  );
}
