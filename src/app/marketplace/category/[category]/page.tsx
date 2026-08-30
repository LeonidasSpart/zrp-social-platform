"use client";

import { use, Suspense } from "react";
import { notFound } from "next/navigation";
import MarketplaceBrowse from "@/components/MarketplaceBrowse";
import { LISTING_CATEGORIES, type ListingCategory } from "@/lib/marketplace";

export default function MarketplaceCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = use(params);

  if (!(LISTING_CATEGORIES as readonly string[]).includes(category)) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <MarketplaceBrowse fixedCategory={category as ListingCategory} />
    </Suspense>
  );
}
