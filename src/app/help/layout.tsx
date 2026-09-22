import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Help Center",
  description:
    "Learn how ZRP Social works, manage your account, understand our plans, protect your privacy, and get the most from the platform.",
  alternates: { canonical: "/help" },

  ...buildSocialMetadata({
    title: "Help Center | ZRP Social",
    description: "Learn how ZRP Social works, manage your account, understand our plans, and protect your privacy.",
    path: "/help",
  }),
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
