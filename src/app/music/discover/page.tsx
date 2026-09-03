"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Search, Shuffle, Play } from "lucide-react";
import TrackList from "@/components/music/TrackList";
import { useMusicPlayer, type MusicTrack } from "@/components/music/MusicPlayerProvider";
import { useLanguage } from "@/contexts/LanguageContext";

type Genre = { genre: string; count: number };

export default function MusicDiscoverPage() {
  return (
    <Suspense fallback={null}>
      <MusicDiscoverPageInner />
    </Suspense>
  );
}

function MusicDiscoverPageInner() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  // Lets the Music Home's genre chips deep-link straight into a
  // pre-filtered Discover instead of landing on the unfiltered "All
  // Tracks" view and making the user re-tap the genre.
  const [activeGenre, setActiveGenre] = useState<string | null>(() => searchParams.get("genre"));
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const { play, addToQueue, clearQueue } = useMusicPlayer();

  useEffect(() => {
    fetch("/api/music/genres")
      .then((r) => (r.ok ? r.json() : []))
      .then(setGenres)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const term = activeGenre || q;
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      const params = new URLSearchParams({ limit: "60" });
      if (term) params.set("q", term);
      fetch(`/api/music/tracks?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : []))
        .then(setTracks)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [q, activeGenre]);

  const like = async (id: string) => {
    const res = await fetch("/api/music/tracks/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: id }),
    });
    if (res.ok) {
      setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, liked: !t.liked } : t)));
    }
  };

  const playAll = (shuffle = false) => {
    if (!tracks.length) return;
    const ordered = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks;
    clearQueue();
    play(ordered[0]);
    ordered.slice(1).forEach((t) => addToQueue(t));
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/music" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label={t("music.common.backToMusic")}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-black text-lg">{t("music.nav.discoverTitle")}</div>

          <div className="relative flex-1 max-w-xl ml-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActiveGenre(null);
              }}
              placeholder={t("music.discover.searchPlaceholder")}
              aria-label={t("music.discover.searchPlaceholder")}
              className="w-full h-10 pl-11 pr-4 rounded-full bg-gray-100 dark:bg-white/[0.07] border border-transparent focus:border-zrp-red/40 outline-none transition text-sm"
            />
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {genres.length > 0 && (
          <section>
            <div className="text-xs uppercase tracking-[0.2em] text-zrp-red font-bold mb-3">{t("music.discover.browseByGenre")}</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveGenre(null)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                  !activeGenre ? "bg-zrp-red text-white" : "bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300"
                }`}
              >
                {t("music.discover.all")}
              </button>
              {genres.map((g) => (
                <button
                  key={g.genre}
                  type="button"
                  onClick={() => {
                    setActiveGenre(g.genre);
                    setQ("");
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                    activeGenre === g.genre ? "bg-zrp-red text-white" : "bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {g.genre} <span className="opacity-60">({g.count})</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl sm:text-2xl font-black">
              {activeGenre ? activeGenre : q ? t("music.discover.resultsFor", { query: q }) : t("music.discover.allTracks")}
            </h1>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => playAll(false)}
                disabled={!tracks.length}
                className="h-9 px-4 rounded-full bg-zrp-red text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> {t("music.common.playAll")}
              </button>
              <button
                type="button"
                onClick={() => playAll(true)}
                disabled={!tracks.length}
                className="h-9 px-4 rounded-full bg-gray-100 dark:bg-white/10 text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"
              >
                <Shuffle className="w-3.5 h-3.5" /> {t("music.common.shuffle")}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
            </div>
          ) : (
            <TrackList
              tracks={tracks}
              onLike={like}
              emptyTitle={t("music.discover.noTracksTitle")}
              emptyDescription={t("music.discover.noTracksBody")}
            />
          )}
        </section>
      </main>
    </div>
  );
}
