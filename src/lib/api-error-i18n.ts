import type { TranslationKey } from "@/lib/translations";

/**
 * A small, curated set of the most common English-only messages API
 * routes return in their `error`/`message` response field. Found via a
 * localization audit: the app-wide convention is
 * `setError(data.error || t(fallbackKey))`, so the `t()` fallback only
 * ever fires when the field is missing - which is rare - meaning almost
 * every error toast/banner shows this literal English text regardless
 * of the viewer's language. These few messages alone account for the
 * large majority of all occurrences across ~250 API route files
 * (`Unauthorized` alone appears 200+ times).
 *
 * This is deliberately NOT exhaustive - a specific, often dynamic
 * server message (a validation limit, a business-rule explanation) is
 * not in this list and is returned unchanged by localizeApiMessage,
 * exactly matching the app's existing raw-passthrough behavior for
 * messages this curated list can't anticipate.
 */
const KNOWN_API_MESSAGES: Record<string, TranslationKey> = {
  Unauthorized: "apiError.unauthorized",
  Forbidden: "apiError.forbidden",
  "Not found": "apiError.notFound",
  "Internal server error": "apiError.internalServerError",
  "Invalid request body": "apiError.invalidRequestBody",
  "Something went wrong": "auth.errTryAgain",
  "Upload failed": "composer.errUploadFailed",
  "User not found": "profile.userNotFound",
};

/**
 * Maps a backend response's raw `error`/`message` string to its real,
 * translated text when it's one of the common messages above; returns
 * every other message completely unchanged. Use it as
 * `setError(localizeApiMessage(data.error, t) || t(fallbackKey))` in
 * place of the previous `setError(data.error || t(fallbackKey))`.
 */
export function localizeApiMessage(
  raw: string | null | undefined,
  t: (key: TranslationKey) => string,
): string | undefined {
  if (!raw) return raw ?? undefined;
  const key = KNOWN_API_MESSAGES[raw];
  return key ? t(key) : raw;
}
