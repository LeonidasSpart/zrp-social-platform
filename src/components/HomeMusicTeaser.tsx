"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Music2, Play } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface MusicTrack {
  id: string;
  title: string;
  coverUrl: string | null;
  artist: { displayName: string };
}

// Reuses the already-batched /api/music/home endpoint (one request,
// server-side parallel queries) that the Music home screen itself uses -
// no separate Music query added just for this teaser. Shows real recent
// releases only; renders nothing if there's no track data yet.
export default function HomeMusicTeaser() {
  const { t } = useLanguage();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/music/home")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const newReleases = Array.isArray(data.newReleases) ? data.newReleases : [];
        setTracks(newReleases.slice(0, 3));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-zrp-deepBlack px-4 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-zrp-red" />
        </div>
      </div>
    );
  }

  if (tracks.length === 0) return null;

  return (
    <div className="bg-white dark:bg-zrp-deepBlack px-4 py-4 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-1.5 text-base font-bold text-gray-900 dark:text-white">
          <Music2 className="w-4 h-4 text-zrp-red" />
          {t("home.discoverMusic")}
        </h2>

        <Link
          href="/music"
          className="text-xs font-semibold text-zrp-red hover:underline"
        >
          {t("home.openZrpMusic")}
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {tracks.map((track) => (
          <Link
            key={track.id}
            href="/music"
            className="group flex-shrink-0 w-32"
          >
            <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
              {track.coverUrl ? (
                <img
                  src={track.coverUrl}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music2 className="w-8 h-8 text-gray-400" />
                </div>
              )}

              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30">
                <div className="bg-zrp-red rounded-full p-2.5">
                  <Play className="w-4 h-4 text-white fill-white" />
                </div>
              </div>
            </div>

            <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white truncate">
              {track.title}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {track.artist.displayName}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
