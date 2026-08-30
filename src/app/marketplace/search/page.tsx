"use client";

import { Suspense } from "react";
import MarketplaceBrowse from "@/components/MarketplaceBrowse";

export default function MarketplaceSearchPage() {
  return (
    <Suspense fallback={null}>
      <MarketplaceBrowse />
    </Suspense>
  );
}
