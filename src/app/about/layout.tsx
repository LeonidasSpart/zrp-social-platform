import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "ZRP Social is a Swiss-European social media platform, built around free speech, privacy, and security. Learn about our mission and why we call Switzerland home.",
  alternates: { canonical: "/about" },

  ...buildSocialMetadata({
    title: "About ZRP Social",
    description: "A Swiss-European social media platform, built around free speech, privacy, and security.",
    path: "/about",
  }),
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
