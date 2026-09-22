import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "ZRP HELP",
  description:
    "ZRP HELP - a verified humanitarian space for people and communities affected by war, disasters, poverty or emergencies. Verified organizations publish transparent campaigns for money, supplies, skills and volunteers.",
  alternates: { canonical: "/aid" },

  ...buildSocialMetadata({
    title: "ZRP HELP | Verified Humanitarian Campaigns",
    description: "Support verified humanitarian campaigns for money, supplies, skills and volunteers, with transparent progress on ZRP.",
    path: "/aid",
  }),
};

export default function AidLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
