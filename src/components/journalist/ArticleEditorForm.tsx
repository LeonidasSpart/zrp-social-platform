"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Send, Save, Eye, X, AlertTriangle } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing-client";

export type JournalistArticleCategory =
  | "WORLD"
  | "EUROPE"
  | "SWITZERLAND"
  | "POLITICS"
  | "BUSINESS"
  | "TECHNOLOGY"
  | "CRYPTO"
  | "SCIENCE"
  | "SPORTS"
  | "CULTURE"
  | "COMMUNITY";

const CATEGORIES: Array<{ value: JournalistArticleCategory; label: string }> = [
  { value: "WORLD", label: "World" },
  { value: "EUROPE", label: "Europe" },
  { value: "SWITZERLAND", label: "Switzerland" },
  { value: "POLITICS", label: "Politics" },
  { value: "BUSINESS", label: "Business" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "SCIENCE", label: "Science" },
  { value: "SPORTS", label: "Sports" },
  { value: "CULTURE", label: "Culture" },
  { value: "COMMUNITY", label: "Community" },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export interface JournalistArticleData {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  category: JournalistArticleCategory;
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "ARCHIVED";
  reviewNote: string | null;
}

interface ArticleEditorFormProps {
  mode: "create" | "edit";
  article?: JournalistArticleData;
  /** Whether the signed-in journalist is currently VERIFIED (can submit for review). */
  canSubmit: boolean;
}

export default function ArticleEditorForm({ mode, article, canSubmit }: ArticleEditorFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [content, setContent] = useState(article?.content ?? "");
  const [coverImage, setCoverImage] = useState(article?.coverImage ?? "");
  const [sourceName, setSourceName] = useState(article?.sourceName ?? "");
  const [sourceUrl, setSourceUrl] = useState(article?.sourceUrl ?? "");
  const [category, setCategory] = useState<JournalistArticleCategory>(article?.category ?? "WORLD");

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const { startUpload } = useUploadThing("newsCoverImage", {
    onClientUploadComplete: (files) => {
      if (files[0]?.ufsUrl) setCoverImage(files[0].ufsUrl);
      setUploading(false);
    },
    onUploadError: (err) => {
      setUploading(false);
      setError(`Cover image upload failed: ${err.message}`);
    },
  });

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  async function handleCoverFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    await startUpload([file]);
  }

  function buildPayload() {
    return {
      title: title.trim(),
      slug: (slugTouched ? slug : slugify(title)).trim(),
      excerpt: excerpt.trim() || null,
      content: content.trim(),
      coverImage: coverImage.trim() || null,
      sourceName: sourceName.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
      category,
    };
  }

  function validate(): string | null {
    if (!title.trim()) return "Title is required.";
    if (!(slugTouched ? slug : slugify(title)).trim()) return "Slug is required.";
    if (!content.trim()) return "Article content is required.";
    return null;
  }

  async function handleSave(submit: boolean, event?: FormEvent) {
    event?.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (submit && !canSubmit) {
      setError("Only verified journalists can submit articles for review.");
      return;
    }

    setError(null);
    setSaving(submit ? "submit" : "draft");

    try {
      let response: Response;

      if (mode === "create") {
        response = await fetch("/api/journalist/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...buildPayload(), status: submit ? "PENDING_REVIEW" : "DRAFT" }),
        });
      } else {
        response = await fetch(`/api/journalist/articles/${article!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...buildPayload(), submit }),
        });
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to save article");
      }

      router.push("/journalist");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save article");
    } finally {
      setSaving(null);
    }
  }

  const isRejected = article?.status === "REJECTED";
  const isLocked = article && article.status !== "DRAFT" && article.status !== "REJECTED";

  return (
    <div className="mx-auto max-w-3xl">
      {isRejected && article?.reviewNote && (
        <div className="mb-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">This article was rejected</p>
            <p className="mt-1">{article.reviewNote}</p>
            <p className="mt-1 text-xs opacity-80">Edit and resubmit below to send it back for review.</p>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="mb-5 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-300">
          This article is {article!.status === "PENDING_REVIEW" ? "pending review" : article!.status.toLowerCase()} and can no longer be edited here.
        </div>
      )}

      {error && (
        <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {preview ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => setPreview(false)}
            className="mb-4 text-sm font-medium text-zrp-red hover:underline"
          >
            ← Back to editor
          </button>

          {coverImage && (
            <img src={coverImage} alt="" className="mb-4 aspect-video w-full rounded-xl object-cover" />
          )}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zrp-red">
            {CATEGORIES.find((c) => c.value === category)?.label}
          </p>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title || "Untitled article"}</h1>
          {excerpt && <p className="mt-3 text-lg text-gray-600 dark:text-gray-300">{excerpt}</p>}
          <div className="prose prose-neutral mt-6 max-w-none whitespace-pre-wrap dark:prose-invert">
            {content || "Nothing written yet."}
          </div>
          {(sourceName || sourceUrl) && (
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              Source: {sourceName || sourceUrl}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => handleSave(false, e)} className="space-y-5">
          <fieldset disabled={!!isLocked} className="space-y-5 disabled:opacity-60">
            {/* Cover image */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Cover image
              </label>
              <div className="flex items-center gap-4">
                {coverImage ? (
                  <img src={coverImage} alt="" className="h-24 w-40 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 dark:border-gray-700">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                <label className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                  {uploading ? "Uploading…" : "Upload image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => handleCoverFile(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                placeholder="Article title"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Slug</label>
              <input
                type="text"
                value={slugTouched ? slug : slugify(title)}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                placeholder="article-slug"
              />
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as JournalistArticleCategory)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Excerpt */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Excerpt</label>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                placeholder="Short summary shown in article lists"
              />
            </div>

            {/* Content */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                placeholder="Write the full article here…"
              />
            </div>

            {/* Source */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Source name (optional)
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Source URL (optional)
                </label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
            </div>
          </fieldset>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setPreview(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>

            {!isLocked && (
              <>
                <button
                  type="submit"
                  disabled={saving !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save draft
                </button>

                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving !== null || !canSubmit}
                  title={canSubmit ? undefined : "Only verified journalists can submit for review"}
                  className="inline-flex items-center gap-2 rounded-lg bg-zrp-red px-4 py-2 text-sm font-semibold text-white hover:bg-zrp-darkRed disabled:opacity-60"
                >
                  {saving === "submit" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {isRejected ? "Resubmit for review" : "Submit for review"}
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
