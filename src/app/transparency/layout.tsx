import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Moderation Transparency",
  description:
    "Real, aggregate moderation statistics from ZRP Social - reports received, actions taken, and resolution times. No personal data, no post content, no usernames.",
  alternates: { canonical: "/transparency" },

  ...buildSocialMetadata({
    title: "Moderation Transparency | ZRP Social",
    description: "Real, aggregate moderation statistics from ZRP Social - reports received, actions taken, and resolution times.",
    path: "/transparency",
  }),
};

export default function TransparencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
