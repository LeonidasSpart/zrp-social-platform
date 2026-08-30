"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import ListingForm, { type ListingFormValues } from "@/components/ListingForm";

interface ListingData {
  sellerId: string;
  category: string;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  priceOnRequest: boolean;
  location: string | null;
  imageUrls: string[];
  videoUrl: string | null;
}

export default function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useLanguage();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [listing, setListing] = useState<ListingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notAllowed, setNotAllowed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    fetch(`/api/listings/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotAllowed(true);
          return;
        }
        const data = await res.json();
        if (session?.user?.id && data.sellerId !== session.user.id) {
          setNotAllowed(true);
          return;
        }
        setListing(data);
      })
      .catch(() => setNotAllowed(true))
      .finally(() => setLoading(false));
  }, [id, session?.user?.id]);

  const handleSubmit = async (values: ListingFormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/listings/${id}`, {
        method: "PUT",
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
        router.push(`/marketplace/listing/${id}`);
      } else {
        throw new Error(data.error || t("marketplace.errUpdateFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notAllowed || !listing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center text-gray-500 dark:text-gray-400">
        {t("marketplace.editNotAllowed")}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
        {t("marketplace.editListing")}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("marketplace.editListingNote")}
      </p>
      <ListingForm
        initialValues={{
          category: listing.category as ListingFormValues["category"],
          title: listing.title,
          description: listing.description,
          priceOnRequest: listing.priceOnRequest,
          price: listing.price?.toString() || "",
          currency: listing.currency,
          location: listing.location || "",
          imageUrls: listing.imageUrls,
          videoUrl: listing.videoUrl,
        }}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel={t("marketplace.saveChanges")}
        submittingLabel={t("marketplace.submitting")}
      />
    </div>
  );
}
