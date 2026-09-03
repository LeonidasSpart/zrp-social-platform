// Shared YouTube URL handling for the link-preview system
// (src/app/api/link-preview/route.ts). Kept as pure, network-free string
// parsing so it's usable both server-side and in tests without mocking
// anything.

const YOUTUBE_HOSTNAMES = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

export function isYouTubeUrl(url: string): boolean {
  try {
    return YOUTUBE_HOSTNAMES.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

// A real YouTube video ID is always exactly 11 characters of
// [A-Za-z0-9_-]. Matching that length strictly (not just "11 or more")
// is what keeps this from treating an arbitrary path segment on some
// other site as a video ID - see isYouTubeUrl for the hostname gate
// this is meant to be paired with.
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts the 11-character video ID from any of the URL shapes YouTube
 * actually uses, ignoring tracking/playback query params (?si=, &t=,
 * etc.) since the ID only ever lives in the path or the `v` query param.
 * Returns null for anything that isn't a YouTube URL, or that doesn't
 * resolve to a well-formed video ID - never guesses.
 *
 * Supported shapes:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/shorts/VIDEO_ID
 *   https://youtube.com/shorts/VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 *   https://www.youtube-nocookie.com/embed/VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!isYouTubeUrl(url)) return null;

  const hostname = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (hostname === "youtu.be") {
    const id = path.slice(1).split("/")[0];
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  const shortsOrEmbed = path.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
  if (shortsOrEmbed) {
    return VIDEO_ID_PATTERN.test(shortsOrEmbed[1]) ? shortsOrEmbed[1] : null;
  }

  if (path === "/watch") {
    const id = parsed.searchParams.get("v");
    return id && VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  return null;
}

export function getYouTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeCanonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
