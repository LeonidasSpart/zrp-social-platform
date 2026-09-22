import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "ZRP News",
  description:
    "ZRP News brings you the latest stories from Switzerland, Europe and around the world.",
  alternates: { canonical: "/news" },

  ...buildSocialMetadata({
    title: "ZRP News",
    description: "ZRP News brings you the latest stories from Switzerland, Europe and around the world.",
    path: "/news",
  }),
};

export default function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
