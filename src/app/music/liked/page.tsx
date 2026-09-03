"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Shuffle } from "lucide-react";
import TrackList from "@/components/music/TrackList";
import { useMusicPlayer, type MusicTrack } from "@/components/music/MusicPlayerProvider";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MusicLikedPage() {
  const { t } = useLanguage();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const { play, addToQueue, clearQueue } = useMusicPlayer();

  useEffect(() => {
    fetch("/api/music/library", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { likes: [] }))
      .then((data) => {
        const liked = (data.likes || []).map(
          (l: { track: MusicTrack }) => ({ ...l.track, liked: true })
        );
        setTracks(liked);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const unlike = async (id: string) => {
    const res = await fetch("/api/music/tracks/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: id }),
    });
    if (res.ok) setTracks((prev) => prev.filter((t) => t.id !== id));
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
          <div className="font-black text-lg">{t("music.liked.title")}</div>

          {tracks.length > 0 && (
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => playAll(false)} className="h-9 px-4 rounded-full bg-zrp-red text-white text-sm font-bold flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 fill-current" /> {t("music.common.playAll")}
              </button>
              <button type="button" onClick={() => playAll(true)} className="h-9 px-4 rounded-full bg-gray-100 dark:bg-white/10 text-sm font-bold flex items-center gap-1.5">
                <Shuffle className="w-3.5 h-3.5" /> {t("music.common.shuffle")}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
          </div>
        ) : (
          <TrackList
            tracks={tracks}
            onLike={unlike}
            showAlbum
            emptyTitle={t("music.liked.emptyTitle")}
            emptyDescription={t("music.liked.emptyBody")}
          />
        )}
      </main>
    </div>
  );
}
