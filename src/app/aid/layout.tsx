import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZRP HELP",
  description:
    "ZRP HELP - a verified humanitarian space for people and communities affected by war, disasters, poverty or emergencies. Verified organizations publish transparent campaigns for money, supplies, skills and volunteers.",
  alternates: { canonical: "/aid" },
  openGraph: {
    title: "ZRP HELP | Verified Humanitarian Campaigns",
    description:
      "Support verified humanitarian campaigns for money, supplies, skills and volunteers, with transparent progress on ZRP.",
    url: "/aid",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZRP HELP | Verified Humanitarian Campaigns",
    description:
      "Support verified humanitarian campaigns for money, supplies, skills and volunteers, with transparent progress on ZRP.",
  },
};

export default function AidLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
