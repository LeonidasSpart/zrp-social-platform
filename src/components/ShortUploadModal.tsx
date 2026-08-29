"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Upload, Loader2 } from "lucide-react";
import { uploadFiles } from "@/lib/uploadthing-client";
import { getPlanLimits } from "@/lib/limits";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

interface ShortUploadModalProps {
  onClose: () => void;
  onUploaded: (post: any) => void;
}

// ─────────────────────────────────────────────────────────────
// MEDIA HELPERS
// ─────────────────────────────────────────────────────────────

function getFileExtension(
  file: File
) {
  const name =
    file.name
      .toLowerCase()
      .split("?")[0]
      .split("#")[0];

  const lastDot =
    name.lastIndexOf(".");

  if (lastDot === -1) {
    return "";
  }

  return name.slice(
    lastDot
  );
}

function isGifFile(
  file: File
) {
  const extension =
    getFileExtension(file);

  return (
    extension === ".gif" ||
    file.type.toLowerCase() ===
      "image/gif"
  );
}

function isRealVideoFile(
  file: File
) {
  /*
   * GIF ALWAYS WINS.
   *
   * Never allow a GIF to enter
   * the Short upload flow.
   */
  if (isGifFile(file)) {
    return false;
  }

  const extension =
    getFileExtension(file);

  const videoExtensions =
    [
      ".mp4",
      ".webm",
      ".mov",
      ".avi",
      ".mkv",
      ".m4v",
      ".3gp",
    ];

  /*
   * Accept known video extensions.
   */
  if (
    videoExtensions.includes(
      extension
    )
  ) {
    return true;
  }

  /*
   * Also accept browser video MIME
   * types when the extension is not
   * one of the known formats.
   */
  return file.type
    .toLowerCase()
    .startsWith("video/");
}

// ─────────────────────────────────────────────────────────────
// ERROR MESSAGES
// ─────────────────────────────────────────────────────────────
//
// The UploadThing client throws with .message set to the raw
// error code (e.g. "UPLOAD_FAILED") when the underlying storage
// transfer itself fails rather than a specific validation check,
// which read as a cryptic error to users. Map the codes we can
// realistically hit here to a message that names a likely cause,
// per user feedback asking for more specific upload errors.
const UPLOAD_ERROR_KEYS: Record<string, TranslationKey> = {
  UPLOAD_FAILED: "shorts.upload.errUploadFailedDetailed",
  TOO_LARGE: "shorts.upload.errTooLargePlan",
  FILE_LIMIT_EXCEEDED: "shorts.upload.errTooLargePlan",
  URL_GENERATION_FAILED: "shorts.upload.errUrlGenFailed",
  INTERNAL_SERVER_ERROR: "shorts.upload.errInternalServer",
};

function describeUploadError(
  err: unknown,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  if (err instanceof Error) {
    const mappedKey =
      UPLOAD_ERROR_KEYS[
        err.message
      ];

    if (mappedKey) {
      return t(mappedKey);
    }

    return err.message;
  }

  return t("shorts.upload.errGeneric");
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ShortUploadModal({
  onClose,
  onUploaded,
}: ShortUploadModalProps) {
  const {
    data: session,
  } = useSession();

  const { t } = useLanguage();

  const plan =
    (session?.user?.plan as any) ||
    "free";

  const limits =
    getPlanLimits(plan);

  const [
    file,
    setFile,
  ] = useState<File | null>(
    null
  );

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState<string | null>(
    null
  );

  const [
    caption,
    setCaption,
  ] = useState("");

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const fileInputRef =
    useRef<HTMLInputElement>(
      null
    );

  // ─────────────────────────────────────────────────────────────
  // CLEAN PREVIEW URL
  // ─────────────────────────────────────────────────────────────

  const clearSelectedFile =
    () => {
      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl
        );
      }

      setFile(null);
      setPreviewUrl(null);

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }
    };

  // ─────────────────────────────────────────────────────────────
  // FILE SELECT
  // ─────────────────────────────────────────────────────────────

  const handleFileSelect =
    (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const selected =
        e.target.files?.[0];

      setError(null);

      if (!selected) {
        return;
      }

      /*
       * HARD GIF BLOCK.
       */
      if (
        isGifFile(selected)
      ) {
        setError(
          t("shorts.upload.errGifNotAllowed")
        );

        e.target.value =
          "";

        return;
      }

      /*
       * HARD VIDEO CHECK.
       */
      if (
        !isRealVideoFile(
          selected
        )
      ) {
        setError(
          t("shorts.upload.errNotVideo")
        );

        e.target.value =
          "";

        return;
      }

      const maxBytes =
        limits.videoUploadMB *
        1024 *
        1024;

      if (
        selected.size >
        maxBytes
      ) {
        setError(
          t("shorts.upload.errTooLarge", { mb: limits.videoUploadMB })
        );

        e.target.value =
          "";

        return;
      }

      /*
       * Remove previous object URL.
       */
      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl
        );
      }

      setFile(
        selected
      );

      setPreviewUrl(
        URL.createObjectURL(
          selected
        )
      );
    };

  // ─────────────────────────────────────────────────────────────
  // SUBMIT
  // ─────────────────────────────────────────────────────────────

  const handleSubmit =
    async () => {
      if (!file) {
        setError(
          t("shorts.upload.errChooseVideoFirst")
        );

        return;
      }

      /*
       * Validate AGAIN at upload time.
       *
       * This prevents a file from being
       * changed or bypassing the initial
       * selection check.
       */
      if (
        isGifFile(file)
      ) {
        setError(
          t("shorts.upload.errGifSimple")
        );

        return;
      }

      if (
        !isRealVideoFile(file)
      ) {
        setError(
          t("shorts.upload.errOnlyRealVideo")
        );

        return;
      }

      setUploading(
        true
      );

      setError(null);

      try {
        // ─────────────────────────────────────────────────────
        // UPLOAD
        // ─────────────────────────────────────────────────────

        const result =
          await uploadFiles(
            "postMedia",
            {
              files: [file],
            }
          );

        if (
          !result ||
          result.length === 0
        ) {
          throw new Error(
            t("shorts.upload.errUploadFailedNoFile")
          );
        }

        const uploadedFile =
          result[0];

        const ufsUrl =
          uploadedFile.ufsUrl;

        if (!ufsUrl) {
          throw new Error(
            t("shorts.upload.errUploadFailedNoUrl")
          );
        }

        /*
         * IMPORTANT:
         *
         * Check the returned URL too.
         *
         * If UploadThing somehow returns a
         * GIF URL, refuse to publish it.
         */
        const uploadedPath =
          ufsUrl
            .toLowerCase()
            .split("?")[0]
            .split("#")[0];

        if (
          uploadedPath.endsWith(
            ".gif"
          )
        ) {
          throw new Error(
            t("shorts.upload.errUploadedGif")
          );
        }

        // ─────────────────────────────────────────────────────
        // CREATE POST
        // ─────────────────────────────────────────────────────

        const res =
          await fetch(
            "/api/posts",
            {
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify(
                {
                  content:
                    caption.trim(),

                  imageUrl:
                    ufsUrl,

                  /*
                   * Shorts are real videos.
                   */
                  mediaType:
                    "video",
                }
              ),
            }
          );

        if (!res.ok) {
          const err =
            await res
              .json()
              .catch(
                () => ({})
              );

          throw new Error(
            err.error ||
              t("shorts.upload.errFailedPublish")
          );
        }

        const data =
          await res.json();

        const createdPost =
          data.post ||
          data;

        /*
         * Final client-side check before
         * giving the post back to Shorts.
         */
        if (
          !createdPost?.imageUrl ||
          isGifFile(
            file
          ) ||
          createdPost.imageUrl
            .toLowerCase()
            .split("?")[0]
            .split("#")[0]
            .endsWith(".gif")
        ) {
          throw new Error(
            t("shorts.upload.errPublishedGif")
          );
        }

        onUploaded(
          createdPost
        );
      } catch (err) {
        setError(
          describeUploadError(
            err,
            t
          )
        );
      } finally {
        setUploading(
          false
        );
      }
    };

  // ─────────────────────────────────────────────────────────────
  // CLOSE
  // ─────────────────────────────────────────────────────────────

  const handleClose =
    () => {
      if (uploading) {
        return;
      }

      if (previewUrl) {
        URL.revokeObjectURL(
          previewUrl
        );
      }

      onClose();
    };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center px-4">

      <div className="bg-white dark:bg-zrp-charcoal rounded-2xl w-full max-w-md overflow-hidden">

        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">

          <h2 className="font-semibold text-gray-900 dark:text-white">
            {t("shorts.postAShort")}
          </h2>

          <button
            onClick={
              handleClose
            }
            disabled={
              uploading
            }
            className="p-1 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
            aria-label={t("shorts.upload.close")}
          >
            <X className="w-5 h-5" />
          </button>

        </div>

        {/* BODY */}
        <div className="p-4 space-y-3">

          {/* PREVIEW */}
          {previewUrl ? (
            <div className="relative aspect-[9/16] max-h-[50vh] mx-auto bg-black rounded-xl overflow-hidden">

              <video
                src={
                  previewUrl
                }
                className="w-full h-full object-contain"
                controls
                playsInline
              />

              <button
                onClick={
                  clearSelectedFile
                }
                disabled={
                  uploading
                }
                className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 text-white disabled:opacity-50"
                aria-label={t("shorts.upload.removeVideo")}
              >
                <X className="w-4 h-4" />
              </button>

            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={
                uploading
              }
              className="w-full aspect-[9/16] max-h-[50vh] mx-auto flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:border-zrp-red hover:text-zrp-red transition disabled:opacity-50"
            >

              <Upload className="w-8 h-8" />

              <span className="text-sm">
                {t("shorts.upload.chooseVideo")}
              </span>

              <span className="text-xs text-gray-400">
                {t("shorts.upload.formatsHint")}
              </span>

              <span className="text-xs text-gray-400">
                {t("shorts.upload.upToMB", { mb: limits.videoUploadMB })}
              </span>

            </button>
          )}

          {/* FILE INPUT */}
          <input
            ref={
              fileInputRef
            }
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,video/*"
            onChange={
              handleFileSelect
            }
            className="hidden"
          />

          {/* CAPTION */}
          <textarea
            value={
              caption
            }
            onChange={(
              e
            ) =>
              setCaption(
                e.target.value
              )
            }
            placeholder={t("shorts.upload.captionPlaceholder")}
            rows={2}
            maxLength={
              limits.postLength
            }
            disabled={
              uploading
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-zrp-red disabled:opacity-60"
          />

          {/* ERROR */}
          {error && (
            <p className="text-sm text-red-500">
              {
                error
              }
            </p>
          )}

          {/* SUBMIT */}
          <button
            onClick={
              handleSubmit
            }
            disabled={
              !file ||
              uploading
            }
            className="w-full bg-zrp-red text-white py-2.5 rounded-full text-sm font-medium hover:bg-zrp-darkRed disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >

            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("shorts.upload.posting")}
              </>
            ) : (
              t("shorts.upload.postShort")
            )}

          </button>

        </div>
      </div>
    </div>
  );
}
