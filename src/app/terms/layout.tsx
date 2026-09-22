import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Read the ZRP Social Terms of Service governing your use of the platform.",
  alternates: { canonical: "/terms" },

  ...buildSocialMetadata({
    title: "Terms of Service | ZRP Social",
    description: "The Terms of Service governing your use of ZRP Social.",
    path: "/terms",
  }),
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
