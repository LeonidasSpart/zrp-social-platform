import type { Metadata } from "next";
import { prisma } from "@/lib/db";

// Reads the DB at request time via generateMetadata - force dynamic
// rendering so `next build` never tries to run that query without a
// reachable database.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const cleanUsername = username.replace(/^@/, "");

  const user = await prisma.user.findFirst({
    where: { username: { equals: cleanUsername, mode: "insensitive" } },
    select: { username: true, name: true, isPrivate: true, banned: true },
  });

  if (!user || user.banned || user.isPrivate) {
    return {
      title: "Trust Passport",
      robots: { index: false, follow: false },
    };
  }

  const displayName = user.name || user.username;
  const title = `${displayName}'s Trust Passport`;
  const description = `View @${user.username}'s Trust Passport on ZRP Social - account verification and trust signals.`;

  return {
    title,
    description,
    alternates: { canonical: `/trust/${user.username}` },
    openGraph: {
      title: `${title} | ZRP Social`,
      description,
      url: `/trust/${user.username}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${title} | ZRP Social`,
      description,
    },
  };
}

export default function TrustLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
