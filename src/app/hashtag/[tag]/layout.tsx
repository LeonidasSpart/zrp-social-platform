import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const cleanTag = decodeURIComponent(tag).replace(/^#/, "");
  const title = `#${cleanTag}`;
  const description = `See posts tagged #${cleanTag} on ZRP Social.`;

  return {
    title,
    description,
    alternates: { canonical: `/hashtag/${encodeURIComponent(cleanTag)}` },
    openGraph: {
      title: `#${cleanTag} | ZRP Social`,
      description,
      url: `/hashtag/${encodeURIComponent(cleanTag)}`,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `#${cleanTag} | ZRP Social`,
      description,
    },
  };
}

export default function HashtagLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
