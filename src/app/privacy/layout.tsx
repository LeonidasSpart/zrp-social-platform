import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Read the ZRP Social Privacy Policy to learn how we collect, use, and protect your data under Swiss data protection law.",
  alternates: { canonical: "/privacy" },

  ...buildSocialMetadata({
    title: "Privacy Policy | ZRP Social",
    description: "How ZRP Social collects, uses, and protects your data under Swiss data protection law.",
    path: "/privacy",
  }),
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
