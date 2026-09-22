import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description:
    "ZRP Social's Community Guidelines: the rules for user conduct, content, and moderation that keep the platform safe, drawn directly from our Terms of Service.",
  alternates: { canonical: "/guidelines" },

  ...buildSocialMetadata({
    title: "Community Guidelines | ZRP Social",
    description: "The rules for user conduct, content, and moderation that keep ZRP Social safe.",
    path: "/guidelines",
  }),
};

export default function GuidelinesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
