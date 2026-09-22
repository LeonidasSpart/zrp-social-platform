import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const cleanTag = decodeURIComponent(tag).replace(/^#/, "");
  const title = `#${cleanTag}`;
  const description = `See posts tagged #${cleanTag} on ZRP Social.`;
  const path = `/hashtag/${encodeURIComponent(cleanTag)}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    ...buildSocialMetadata({
      title: `#${cleanTag} | ZRP Social`,
      description,
      path,
    }),
  };
}

export default function HashtagLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
