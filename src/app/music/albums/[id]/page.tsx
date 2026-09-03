"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Shuffle, Disc3 } from "lucide-react";
import TrackList from "@/components/music/TrackList";
import { useMusicPlayer, type MusicTrack } from "@/components/music/MusicPlayerProvider";
import { useLanguage } from "@/contexts/LanguageContext";

type AlbumDetail = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  releaseDate: string | null;
  artist: { id: string; displayName: string; avatarUrl: string | null };
  tracks: MusicTrack[];
};

export default function MusicAlbumPage() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { play, addToQueue, clearQueue } = useMusicPlayer();

  const load = useCallback(async () => {
    const res = await fetch(`/api/music/albums/${params.id}`, { cache: "no-store" });
    if (res.ok) setAlbum(await res.json());
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const like = async (id: string) => {
    const res = await fetch("/api/music/tracks/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: id }),
    });
    if (res.ok) {
      setAlbum((prev) =>
        prev ? { ...prev, tracks: prev.tracks.map((t) => (t.id === id ? { ...t, liked: !t.liked } : t)) } : prev
      );
    }
  };

  const playAll = (shuffle = false) => {
    if (!album?.tracks.length) return;
    const ordered = shuffle ? [...album.tracks].sort(() => Math.random() - 0.5) : album.tracks;
    clearQueue();
    play(ordered[0]);
    ordered.slice(1).forEach((t) => addToQueue(t));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#050505]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white dark:bg-[#050505] text-gray-950 dark:text-white">
        <div className="font-bold">{t("music.albumDetail.notFound")}</div>
        <Link href="/music" className="text-zrp-red text-sm">{t("music.common.backToMusic")}</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/music" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label={t("music.common.backToMusic")}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-black text-lg truncate">{album.title}</div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        <section className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
          <div className="w-40 h-40 sm:w-56 sm:h-56 rounded-2xl overflow-hidden bg-gray-200 dark:bg-white/5 shrink-0 shadow-xl">
            {album.coverUrl ? (
              <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Disc3 className="w-14 h-14 text-gray-300 dark:text-white/20" />
              </div>
            )}
          </div>

          <div className="min-w-0 text-center sm:text-left flex-1">
            <div className="text-xs uppercase tracking-[0.2em] text-zrp-red font-bold">{t("music.albumDetail.eyebrow")}</div>
            <h1 className="text-2xl sm:text-4xl font-black mt-1">{album.title}</h1>
            <Link href={`/music/artists/${album.artist.id}`} className="text-sm text-gray-500 hover:underline mt-2 inline-block">
              {album.artist.displayName}
            </Link>
            {album.description && <p className="text-sm text-gray-500 mt-2 max-w-xl">{album.description}</p>}

            <div className="text-xs text-gray-400 mt-2">
              {album.releaseDate &&
                `${t("music.albumDetail.releasedLabel")} ${new Date(album.releaseDate).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}`}
              {album.releaseDate && album.tracks.length > 0 && " • "}
              {album.tracks.length > 0 &&
                t(album.tracks.length === 1 ? "music.count.tracksOne" : "music.count.tracksOther", {
                  count: album.tracks.length,
                })}
            </div>

            <div className="flex flex-wrap justify-center sm:justify-start gap-3 mt-5">
              <button
                type="button"
                onClick={() => playAll(false)}
                disabled={!album.tracks.length}
                className="h-11 px-5 rounded-full bg-zrp-red text-white font-bold flex items-center gap-2 disabled:opacity-40"
              >
                <Play className="w-4 h-4 fill-current" /> {t("music.common.playAll")}
              </button>
              <button
                type="button"
                onClick={() => playAll(true)}
                disabled={!album.tracks.length}
                className="h-11 px-5 rounded-full bg-gray-100 dark:bg-white/10 font-bold flex items-center gap-2 disabled:opacity-40"
              >
                <Shuffle className="w-4 h-4" /> {t("music.common.shuffle")}
              </button>
            </div>
          </div>
        </section>

        <TrackList tracks={album.tracks} onLike={like} showArtist={false} emptyTitle={t("music.albumDetail.noTracks")} />
      </main>
    </div>
  );
}
