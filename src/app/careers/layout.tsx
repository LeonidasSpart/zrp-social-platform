import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Help build a Swiss-European social media platform. Explore open roles at ZRP Social and join a team focused on free speech, privacy, and security.",
  alternates: { canonical: "/careers" },

  ...buildSocialMetadata({
    title: "Careers at ZRP Social",
    description: "Help build a Swiss-European social media platform. Explore open roles at ZRP Social.",
    path: "/careers",
  }),
};

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
