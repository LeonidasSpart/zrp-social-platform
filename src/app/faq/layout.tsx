import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers to common questions about creating a ZRP Social account, posting, messaging, privacy, plans, and more.",
  alternates: { canonical: "/faq" },

  ...buildSocialMetadata({
    title: "FAQ | ZRP Social",
    description: "Answers to common questions about creating a ZRP Social account, posting, messaging, privacy, plans, and more.",
    path: "/faq",
  }),
};

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
