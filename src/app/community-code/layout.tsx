import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "ZRP Community & Leadership Code",
  description:
    "One framework, four levels of responsibility. The same Community Guidelines apply to everyone on ZRP - Ambassadors, Country Managers and ZRP staff carry additional standards on top of them.",
  alternates: { canonical: "/community-code" },

  ...buildSocialMetadata({
    title: "ZRP Community & Leadership Code",
    description: "One framework, four levels of responsibility for everyone who represents ZRP publicly.",
    path: "/community-code",
  }),
};

export default function CommunityCodeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
