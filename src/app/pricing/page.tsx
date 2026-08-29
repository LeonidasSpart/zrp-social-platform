import type { Metadata } from "next";
import PricingCards from "@/components/PricingCards";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Compare ZRP Social plans, from Free to Business, and find the right fit for your account.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing | ZRP Social",
    description:
      "Compare ZRP Social plans, from Free to Business, and find the right fit for your account.",
    url: "/pricing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing | ZRP Social",
    description:
      "Compare ZRP Social plans, from Free to Business, and find the right fit for your account.",
  },
};

export default function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <PricingCards />
    </div>
  );
}
