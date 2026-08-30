"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import ListingForm, { type ListingFormValues } from "@/components/ListingForm";

export default function NewListingPage() {
  const { t } = useLanguage();
  const { status } = useSession();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const handleSubmit = async (values: ListingFormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: values.category,
          title: values.title,
          description: values.description,
          priceOnRequest: values.priceOnRequest,
          price: values.priceOnRequest ? null : values.price,
          currency: values.currency,
          location: values.location,
          imageUrls: values.imageUrls,
          videoUrl: values.videoUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/marketplace/listing/${data.listing.id}`);
      } else {
        throw new Error(data.error || t("marketplace.errCreateFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        {t("marketplace.createListing")}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("marketplace.createListingNote")}
      </p>
      <ListingForm
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel={t("marketplace.submitListing")}
        submittingLabel={t("marketplace.submitting")}
      />
    </div>
  );
}
