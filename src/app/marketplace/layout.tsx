import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ZRP Market Plus",
  description:
    "ZRP's luxury marketplace - verified sellers and buyers connecting over exotic cars, yachts, private aircraft, luxury real estate, watches, and jewelry.",
  alternates: { canonical: "/marketplace" },
  openGraph: {
    title: "ZRP Market Plus | Luxury Marketplace",
    description:
      "Verified sellers and buyers connecting over exotic cars, yachts, private aircraft, luxury real estate, watches, and jewelry.",
    url: "/marketplace",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZRP Market Plus | Luxury Marketplace",
    description:
      "Verified sellers and buyers connecting over exotic cars, yachts, private aircraft, luxury real estate, watches, and jewelry.",
  },
};

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
