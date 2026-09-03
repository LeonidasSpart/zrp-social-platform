"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface OrphanFile {
  key: string;
  name: string;
  size: number;
  uploadedAt: number | null;
}

interface ScanResult {
  totalFilesInUploadThing: number;
  totalReferencedInDb: number;
  orphanedCount: number;
  orphanedSizeMB: number;
  heldForReviewCount: number;
  heldForReviewSizeMB: number;
  sample: OrphanFile[];
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function AdminStoragePage() {
  const { t } = useLanguage();
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [deletedMessage, setDeletedMessage] = useState<string | null>(null);

  async function scan() {
    setScanning(true);
    setError(null);
    setDeletedMessage(null);

    try {
      const res = await fetch("/api/admin/cleanup-uploadthing", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || t("adminStorage.errScanFailed"));
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminStorage.errScanFailed"));
    } finally {
      setScanning(false);
    }
  }

  async function deleteOrphans() {
    if (!result) return;

    const confirmed = window.confirm(
      t("adminStorage.confirmDelete", { count: result.orphanedCount, sizeMB: result.orphanedSizeMB })
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/cleanup-uploadthing", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || t("adminStorage.errDeleteFailed"));
      }

      setDeletedMessage(t("adminStorage.deletedMessage", { deleted: data.deleted, total: data.orphanedCount }));
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminStorage.errDeleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/admin"
          className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 transition hover:text-red-600 dark:text-gray-400"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("adminStorage.backToAdmin")}
        </Link>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("adminStorage.title")}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("adminStorage.subtitle")}
          </p>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {deletedMessage && (
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
            {deletedMessage}
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {scanning ? t("adminStorage.scanning") : t("adminStorage.scanButton")}
          </button>

          {result && result.orphanedCount > 0 && (
            <button
              type="button"
              onClick={deleteOrphans}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg bg-zrp-red px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zrp-darkRed disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? t("adminStorage.deleting") : t("adminStorage.deleteButton", { count: result.orphanedCount })}
            </button>
          )}
        </div>

        {result && (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="grid grid-cols-2 gap-4 border-b border-gray-200 p-5 sm:grid-cols-4 dark:border-gray-800">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminStorage.statInUploadThing")}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {result.totalFilesInUploadThing}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminStorage.statReferencedInDb")}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {result.totalReferencedInDb}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminStorage.statOrphaned")}</p>
                <p className="text-xl font-bold text-zrp-red">{result.orphanedCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminStorage.statOrphanedSize")}</p>
                <p className="text-xl font-bold text-zrp-red">{result.orphanedSizeMB} MB</p>
              </div>
            </div>

            {result.heldForReviewCount > 0 && (
              <div className="border-b border-gray-200 bg-amber-50 px-5 py-3 text-sm text-amber-800 dark:border-gray-800 dark:bg-amber-950/20 dark:text-amber-300">
                <span className="font-semibold">
                  {t("adminStorage.statHeldForReview")}: {result.heldForReviewCount} ({result.heldForReviewSizeMB} MB)
                </span>
                <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
                  {t("adminStorage.heldForReviewHint", { count: result.heldForReviewCount })}
                </p>
              </div>
            )}

            {result.orphanedCount === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {t("adminStorage.nothingOrphaned")}
              </p>
            ) : (
              <>
                <ul className="max-h-96 divide-y divide-gray-200 overflow-y-auto dark:divide-gray-800">
                  {result.sample.map((f) => (
                    <li
                      key={f.key}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                    >
                      <span className="truncate text-gray-700 dark:text-gray-300">{f.name || f.key}</span>
                      <span className="flex-shrink-0 text-xs text-gray-400">{formatBytes(f.size)}</span>
                    </li>
                  ))}
                </ul>
                {result.orphanedCount > result.sample.length && (
                  <p className="px-5 py-3 text-xs text-gray-400">
                    {t("adminStorage.showingSample", { shown: result.sample.length, total: result.orphanedCount })}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
