"use client";

import { Megaphone } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { truncateForPush } from "@/lib/announcements/types";

interface AnnouncementPreviewProps {
  title: string;
  body: string;
  imageUrl?: string | null;
  actionUrl?: string | null;
}

/**
 * Approximately how an announcement will show up in a member's
 * notification center (src/app/notifications/page.tsx's dedicated
 * "announcement" row) and push banner - NOT a pixel-perfect simulation
 * of either, since push rendering also depends on the OS/browser. The
 * push body is run through the exact same truncateForPush() the real
 * send pipeline uses (src/lib/announcements/dispatch.ts), so the
 * truncation point shown here is never a guess.
 */
export default function AnnouncementPreview({ title, body, imageUrl, actionUrl }: AnnouncementPreviewProps) {
  const { t } = useLanguage();
  const hasContent = title.trim().length > 0 || body.trim().length > 0;

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {t("adminAnnouncements.previewHeading")}
      </h3>

      {!hasContent ? (
        <div className="flex min-h-[96px] items-center justify-center rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
          {t("adminAnnouncements.previewPlaceholder")}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-zrp-deepBlack">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zrp-red/10 text-zrp-red">
              <Megaphone className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">ZRP</p>
              <p className="mt-0.5 break-words font-semibold text-gray-900 dark:text-white">
                {title || " "}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600 dark:text-gray-300">
                {body ? truncateForPush(body) : " "}
              </p>
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  className="mt-2 max-h-40 w-full rounded-xl object-cover"
                />
              )}
              {actionUrl && (
                <p className="mt-2 truncate text-xs font-medium text-zrp-red">{actionUrl}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t("adminAnnouncements.previewNote")}</p>
    </div>
  );
}
