"use client";

import { useState, useRef } from "react";
import { X, ImagePlus, Video, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUploadThing } from "@/lib/uploadthing-client";
import { CATEGORY_META, LISTING_CATEGORIES, type ListingCategory } from "@/lib/marketplace";

export interface ListingFormValues {
  category: ListingCategory | "";
  title: string;
  description: string;
  priceOnRequest: boolean;
  price: string;
  currency: string;
  location: string;
  imageUrls: string[];
  videoUrl: string | null;
}

interface ListingFormProps {
  initialValues?: Partial<ListingFormValues>;
  onSubmit: (values: ListingFormValues) => Promise<void>;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
}

export default function ListingForm({
  initialValues,
  onSubmit,
  submitting,
  submitLabel,
  submittingLabel,
}: ListingFormProps) {
  const { t } = useLanguage();

  const [category, setCategory] = useState<ListingCategory | "">(initialValues?.category || "");
  const [title, setTitle] = useState(initialValues?.title || "");
  const [description, setDescription] = useState(initialValues?.description || "");
  const [priceOnRequest, setPriceOnRequest] = useState(initialValues?.priceOnRequest || false);
  const [price, setPrice] = useState(initialValues?.price || "");
  const [currency, setCurrency] = useState(initialValues?.currency || "USD");
  const [location, setLocation] = useState(initialValues?.location || "");
  const [imageUrls, setImageUrls] = useState<string[]>(initialValues?.imageUrls || []);
  const [videoUrl, setVideoUrl] = useState<string | null>(initialValues?.videoUrl || null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { startUpload: startImageUpload } = useUploadThing("listingMedia", {
    onClientUploadComplete: (files) => {
      setImageUrls((prev) => [...prev, ...(files?.map((f) => f.url) || [])]);
      setUploadingImages(false);
    },
    onUploadError: (err) => {
      setError(err.message);
      setUploadingImages(false);
    },
  });

  const { startUpload: startVideoUpload } = useUploadThing("listingMedia", {
    onClientUploadComplete: (files) => {
      if (files?.[0]) setVideoUrl(files[0].url);
      setUploadingVideo(false);
    },
    onUploadError: (err) => {
      setError(err.message);
      setUploadingVideo(false);
    },
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingImages(true);
    setError(null);
    startImageUpload(files);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideo(true);
    setError(null);
    startVideoUpload([file]);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!category) {
      setError(t("marketplace.errCategoryRequired"));
      return;
    }
    if (imageUrls.length === 0) {
      setError(t("marketplace.errPhotoRequired"));
      return;
    }

    try {
      await onSubmit({
        category,
        title,
        description,
        priceOnRequest,
        price,
        currency,
        location,
        imageUrls,
        videoUrl,
      });
    } catch (err) {
      console.error("Error submitting listing form:", err);
      setError(err instanceof Error ? err.message : t("marketplace.errCreateFailed"));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("marketplace.category")}
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ListingCategory)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          required
        >
          <option value="">{t("marketplace.selectCategory")}</option>
          {LISTING_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(CATEGORY_META[c].labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("marketplace.listingTitle")}
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={150}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("marketplace.description")}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
          rows={6}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("marketplace.price")}
          </label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={priceOnRequest}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
            required={!priceOnRequest}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("marketplace.currency")}
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={priceOnRequest}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
          >
            {["USD", "EUR", "CHF", "GBP", "AED"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={priceOnRequest}
          onChange={(e) => setPriceOnRequest(e.target.checked)}
          className="rounded"
        />
        {t("marketplace.priceOnRequestLabel")}
      </label>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("marketplace.location")}
        </label>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={t("marketplace.locationPlaceholder")}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t("marketplace.photos")}
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {imageUrls.map((url, i) => (
            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={uploadingImages}
            className="w-20 h-20 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-400 hover:border-zrp-red hover:text-zrp-red transition"
          >
            {uploadingImages ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
          </button>
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t("marketplace.videoOptional")}
        </label>
        {videoUrl ? (
          <div className="relative">
            <video src={videoUrl} controls className="w-full max-h-64 rounded-lg" />
            <button
              type="button"
              onClick={() => setVideoUrl(null)}
              className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={uploadingVideo}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition text-sm"
          >
            {uploadingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            {t("marketplace.addVideo")}
          </button>
        )}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          onChange={handleVideoSelect}
          className="hidden"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <p className="text-xs text-gray-400 dark:text-gray-500">{t("marketplace.moderationNote")}</p>

      <button
        type="submit"
        disabled={submitting || uploadingImages || uploadingVideo}
        className="w-full bg-zrp-red text-white py-3 rounded-lg font-semibold hover:bg-red-600 disabled:opacity-50 transition"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
