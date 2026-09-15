/*
 * ============================================================
 * Shared "is this Post row actually a real video" classifier
 * ============================================================
 *
 * Extracted from GET /api/videos (the existing Shorts feed), which
 * defined this exact logic locally. ZRP Discover (src/lib/discover/)
 * needs the identical classification - Discover items ARE Shorts
 * posts, not a new content type - so this lives here once instead of
 * being copied a second time. Behavior is unchanged from the original
 * /api/videos implementation; see that route for the historical
 * reasoning comments this was lifted from.
 *
 * Priority, in order:
 *   1. GIF always rejected, even if mediaType says "video".
 *   2. Known image extensions rejected.
 *   3. Known video extensions accepted (unless mediaType explicitly
 *      contradicts with "image"/"gif").
 *   4. Extensionless URL + mediaType === "video" accepted (storage/CDN
 *      URLs commonly have no file extension).
 *   5. Everything else rejected.
 */

export function getMediaPath(url?: string | null): string {
  if (!url) return "";
  return url.toLowerCase().split("?")[0].split("#")[0].trim();
}

export function isGifMedia(url?: string | null, mediaType?: string | null): boolean {
  const normalizedType = mediaType?.toLowerCase().trim();

  if (!url) return normalizedType === "gif";

  const normalizedUrl = url.toLowerCase();
  const path = getMediaPath(url);

  if (path.endsWith(".gif")) return true;
  if (normalizedType === "gif") return true;
  if (/[?&](format|fm|f)=gif(?:&|$)/i.test(normalizedUrl)) return true;
  if (normalizedUrl.includes("image/gif")) return true;

  return false;
}

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
  ".bmp",
  ".ico",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
];

export function isImageMedia(url?: string | null): boolean {
  if (!url) return false;
  const path = getMediaPath(url);
  return IMAGE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".3gp"];

export function isRealVideoPost(post: { imageUrl?: string | null; mediaType?: string | null }): boolean {
  const url = post.imageUrl;
  const mediaType = post.mediaType?.toLowerCase().trim();

  if (!url) return false;
  if (isGifMedia(url, mediaType)) return false;
  if (isImageMedia(url)) return false;

  const path = getMediaPath(url);
  const hasVideoExtension = VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension));

  if (hasVideoExtension) {
    if (mediaType === "image" || mediaType === "gif") return false;
    return true;
  }

  if (mediaType === "video") return true;

  return false;
}
