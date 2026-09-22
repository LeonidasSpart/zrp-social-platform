import type { Metadata } from "next";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "ZRP Market Plus",
  description:
    "ZRP's luxury marketplace - verified sellers and buyers connecting over exotic cars, yachts, private aircraft, luxury real estate, watches, and jewelry.",
  alternates: { canonical: "/marketplace" },

  ...buildSocialMetadata({
    title: "ZRP Market Plus | Luxury Marketplace",
    description: "Verified sellers and buyers connecting over exotic cars, yachts, private aircraft, luxury real estate, watches, and jewelry.",
    path: "/marketplace",
  }),
};

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
