// Shared album/playlist duration math - single source of truth so
// "X songs • Y min" reads identically on the album page, album cards,
// artist pages, playlists, and Music Studio instead of each place
// rolling its own rounding.

export function sumDurationSec(tracks: Array<{ durationSec?: number | null }>): number {
  return tracks.reduce((total, t) => total + (t.durationSec && t.durationSec > 0 ? t.durationSec : 0), 0);
}

import type { TranslationKey } from "@/lib/translations";

type Translator = (key: TranslationKey, vars?: Record<string, string | number>) => string;

// "38 min" under an hour, "1 hr 12 min" at or above one hour. Matches
// the convention used by every major streaming service, and stays
// legible whether an album's total is a few minutes or several hours
// (a long "Liked Songs" library, a big playlist).
export function formatTotalDuration(totalSeconds: number, t: Translator): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return t("music.duration.minutes", { count: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0
    ? t("music.duration.hoursMinutes", { hours, minutes })
    : t("music.duration.hoursOnly", { hours });
}
