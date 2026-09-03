"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Loader2, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useUploadThing } from "@/lib/uploadthing-client";
import { HELP_CATEGORIES, CATEGORY_META, HELP_NEED_TYPES, NEED_TYPE_META, type HelpCategory, type HelpNeedType } from "@/lib/help";

export default function CreateCampaignPage() {
  const { t } = useLanguage();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [category, setCategory] = useState<HelpCategory>("EMERGENCY");
  const [needTypes, setNeedTypes] = useState<HelpNeedType[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { startUpload } = useUploadThing("listingMedia", {
    onClientUploadComplete: (files) => {
      setUploading(false);
      if (files?.length) {
        setImageUrls((prev) => [...prev, ...files.map((f) => f.ufsUrl)].slice(0, 15));
      }
    },
    onUploadError: (err) => {
      setUploading(false);
      setError(err.message || t("help.errImageUploadFailed"));
    },
  });

  const toggleNeedType = (need: HelpNeedType) => {
    setNeedTypes((prev) => (prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need]));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    startUpload(files);
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (session?.user?.badgeType !== "organization") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-500 dark:text-gray-400">
        <p>{t("help.orgOnlyNote")}</p>
        <Link href="/aid" className="inline-block mt-4 text-zrp-red font-semibold hover:underline">
          {t("help.backToAid")}
        </Link>
      </div>
    );
  }

  const publish = async () => {
    if (!title.trim()) {
      setError(t("help.errTitleRequired"));
      return;
    }
    if (!description.trim()) {
      setError(t("help.errDescriptionRequired"));
      return;
    }
    if (needTypes.length === 0) {
      setError(t("help.errNeedTypeRequired"));
      return;
    }
    if (needTypes.includes("MONEY") && (!goalAmount || Number(goalAmount) <= 0)) {
      setError(t("help.errGoalAmountRequired"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          needTypes,
          title: title.trim(),
          description: description.trim(),
          location: location.trim() || undefined,
          goalAmount: needTypes.includes("MONEY") ? Number(goalAmount) : undefined,
          imageUrls,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");
      router.push("/aid/my-campaigns");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("help.errCreateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/aid" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-zrp-red transition mb-4">
        <ArrowLeft className="w-4 h-4" />
        {t("help.backToAid")}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("help.createTitle")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">{t("help.createSubtitle")}</p>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("help.categoryLabel")}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as HelpCategory)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
          >
            {HELP_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {t(CATEGORY_META[cat].labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("help.needTypesLabel")}</label>
          <div className="flex flex-wrap gap-2">
            {HELP_NEED_TYPES.map((need) => {
              const meta = NEED_TYPE_META[need];
              return (
                <button
                  key={need}
                  type="button"
                  onClick={() => toggleNeedType(need)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    needTypes.includes(need) ? "border-zrp-red bg-zrp-red/10 text-zrp-red" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  <meta.icon className="w-3.5 h-3.5" />
                  {t(meta.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("help.titleLabel")}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("help.descriptionLabel")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={8000}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("help.locationLabel")}</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={150}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
            />
          </div>
          {needTypes.includes("MONEY") && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("help.goalAmountLabel")}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-zrp-red"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{t("help.imagesLabel")}</label>
          {imageUrls.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {imageUrls.map((url) => (
                <div key={url} className="relative aspect-square rounded-lg overflow-hidden">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrls(imageUrls.filter((u) => u !== url))}
                    className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:border-zrp-red transition">
            {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
            {uploading ? t("opportunity.uploading") : t("help.addImages")}
            {/* No accept restriction, deliberately - a cloud storage
                app's own file picker (MEGA, Google Drive, Dropbox)
                frequently doesn't tag an image with any MIME type this
                would filter on, and both Android's and iOS's system
                pickers grey out/hide files that don't match an accept
                filter before this code ever runs. listingMedia's server
                validation already rejects anything that isn't actually
                an image. */}
            <input type="file" multiple className="hidden" onChange={handleFileChange} disabled={uploading} />
          </label>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">{t("help.moderationNote")}</p>

        <button
          type="button"
          disabled={submitting}
          onClick={publish}
          className="px-5 py-3 rounded-full bg-zrp-red text-white font-semibold hover:bg-red-600 transition disabled:opacity-50"
        >
          {submitting ? t("help.publishing") : t("help.publish")}
        </button>
      </div>
    </div>
  );
}
