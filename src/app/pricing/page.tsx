import type { Metadata } from "next";
import PricingCards from "@/components/PricingCards";
import { buildSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Compare ZRP Social plans, from Free to Business, and find the right fit for your account.",
  alternates: { canonical: "/pricing" },

  ...buildSocialMetadata({
    title: "Pricing | ZRP Social",
    description: "Compare ZRP Social plans, from Free to Business, and find the right fit for your account.",
    path: "/pricing",
  }),
};

export default function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <PricingCards />
    </div>
  );
}
