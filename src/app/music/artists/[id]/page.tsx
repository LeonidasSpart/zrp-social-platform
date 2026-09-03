"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Shuffle, ShieldCheck, UserPlus, UserCheck, Disc3, Pencil } from "lucide-react";
import { useSession } from "next-auth/react";
import TrackList from "@/components/music/TrackList";
import { useMusicPlayer, type MusicTrack } from "@/components/music/MusicPlayerProvider";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatTotalDuration } from "@/lib/music/duration";

type Album = {
  id: string;
  title: string;
  coverUrl: string | null;
  releaseDate: string | null;
  totalDurationSec: number;
  _count: { tracks: number };
};

type ArtistDetail = {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  verified: boolean;
  isFollowing: boolean;
  isOwner: boolean;
  albums: Album[];
  tracks: MusicTrack[];
  _count: { tracks: number; followers: number };
};

export default function MusicArtistPage() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const { play, addToQueue, clearQueue } = useMusicPlayer();

  const load = useCallback(async () => {
    const res = await fetch(`/api/music/artists/${params.id}`, { cache: "no-store" });
    if (res.ok) setArtist(await res.json());
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!artist) return;
    setFollowBusy(true);
    const res = await fetch(`/api/music/artists/${artist.id}/follow`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setArtist((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: data.following,
              _count: { ...prev._count, followers: prev._count.followers + (data.following ? 1 : -1) },
            }
          : prev
      );
    }
    setFollowBusy(false);
  };

  const like = async (id: string) => {
    const res = await fetch("/api/music/tracks/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: id }),
    });
    if (res.ok) {
      setArtist((prev) =>
        prev ? { ...prev, tracks: prev.tracks.map((t) => (t.id === id ? { ...t, liked: !t.liked } : t)) } : prev
      );
    }
  };

  const deleteTrack = async (id: string) => {
    if (!artist) return;
    const track = artist.tracks.find((t) => t.id === id);
    if (!confirm(t("music.studio.deleteTrackBody", { title: track?.title || "" }))) return;
    const res = await fetch(`/api/music/tracks/${id}`, { method: "DELETE" });
    if (res.ok) {
      setArtist((prev) =>
        prev
          ? {
              ...prev,
              tracks: prev.tracks.filter((tr) => tr.id !== id),
              _count: { ...prev._count, tracks: prev._count.tracks - 1 },
            }
          : prev
      );
    }
  };

  const playAll = (shuffle = false) => {
    if (!artist?.tracks.length) return;
    const ordered = shuffle ? [...artist.tracks].sort(() => Math.random() - 0.5) : artist.tracks;
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

  if (!artist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white dark:bg-[#050505] text-gray-950 dark:text-white">
        <div className="font-bold">{t("music.artistDetail.notFound")}</div>
        <Link href="/music" className="text-zrp-red text-sm">{t("music.common.backToMusic")}</Link>
      </div>
    );
  }

  const singles = artist.tracks.filter((tr) => !tr.album);

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/music" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label={t("music.common.backToMusic")}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-black text-lg truncate">{artist.displayName}</div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        <section className="flex flex-col sm:flex-row items-center sm:items-end gap-6 rounded-[28px] overflow-hidden border border-gray-200 dark:border-white/10 p-6 sm:p-8 bg-gradient-to-br from-zrp-red/10 via-transparent to-transparent">
          <img
            src={artist.avatarUrl || "/logo.png"}
            alt=""
            className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white dark:border-black shadow-xl shrink-0"
          />

          <div className="min-w-0 text-center sm:text-left flex-1">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-4xl font-black">{artist.displayName}</h1>
              {artist.verified && <ShieldCheck className="w-6 h-6 text-zrp-red" aria-label={t("music.artistDetail.verifiedAria")} />}
            </div>

            {artist.bio && <p className="text-sm text-gray-500 mt-2 max-w-xl">{artist.bio}</p>}

            <div className="text-sm text-gray-500 mt-2">
              {t(artist._count.tracks === 1 ? "music.count.tracksOne" : "music.count.tracksOther", { count: artist._count.tracks })}
              {" · "}
              {t(artist._count.followers === 1 ? "music.count.followersOne" : "music.count.followersOther", { count: artist._count.followers })}
            </div>

            <div className="flex flex-wrap justify-center sm:justify-start gap-3 mt-5">
              <button
                type="button"
                onClick={() => playAll(false)}
                disabled={!artist.tracks.length}
                className="h-11 px-5 rounded-full bg-zrp-red text-white font-bold flex items-center gap-2 disabled:opacity-40"
              >
                <Play className="w-4 h-4 fill-current" /> {t("music.common.playAll")}
              </button>
              <button
                type="button"
                onClick={() => playAll(true)}
                disabled={!artist.tracks.length}
                className="h-11 px-5 rounded-full bg-gray-100 dark:bg-white/10 font-bold flex items-center gap-2 disabled:opacity-40"
              >
                <Shuffle className="w-4 h-4" /> {t("music.common.shuffle")}
              </button>
              {session?.user && !artist.isOwner && (
                <button
                  type="button"
                  onClick={toggleFollow}
                  disabled={followBusy}
                  className={`h-11 px-5 rounded-full font-bold flex items-center gap-2 border transition disabled:opacity-50 ${
                    artist.isFollowing
                      ? "border-zrp-red text-zrp-red bg-zrp-red/10"
                      : "border-gray-200 dark:border-white/10"
                  }`}
                >
                  {artist.isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  {artist.isFollowing ? t("music.artistDetail.following") : t("music.artistDetail.follow")}
                </button>
              )}
              {artist.isOwner && (
                <Link
                  href="/music?studio=1&tab=artist"
                  className="h-11 px-5 rounded-full font-bold flex items-center gap-2 border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 transition"
                >
                  <Pencil className="w-4 h-4" />
                  {t("music.artistDetail.editProfile")}
                </Link>
              )}
            </div>
          </div>
        </section>

        {artist.albums.length > 0 && (
          <section>
            <h2 className="text-xl font-black mb-4">{t("music.artistDetail.albumsHeading")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {artist.albums.map((album) => (
                <Link
                  key={album.id}
                  href={`/music/albums/${album.id}`}
                  className="group rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.035] overflow-hidden hover:border-zrp-red/30 transition"
                >
                  <div className="aspect-square bg-gray-200 dark:bg-white/5 overflow-hidden">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="w-10 h-10 text-gray-300 dark:text-white/20" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-bold truncate">{album.title}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {album.releaseDate && `${new Date(album.releaseDate).getFullYear()} • `}
                      {t(album._count.tracks === 1 ? "music.count.tracksOne" : "music.count.tracksOther", { count: album._count.tracks })}
                      {album.totalDurationSec > 0 && ` • ${formatTotalDuration(album.totalDurationSec, t)}`}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {singles.length > 0 && (
          <section>
            <h2 className="text-xl font-black mb-4">{t("music.artistDetail.singlesHeading")}</h2>
            <TrackList
              tracks={singles}
              onLike={like}
              onRemove={artist.isOwner ? deleteTrack : undefined}
              removeLabel={artist.isOwner ? t("music.studio.deleteTrack") : undefined}
              showArtist={false}
            />
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black">{t("music.artistDetail.tracksHeading")}</h2>
            {artist.isOwner && artist.tracks.length > 0 && (
              <Link href="/music?studio=1&tab=tracks" className="text-sm text-zrp-red hover:underline shrink-0">
                {t("music.artistDetail.manageInStudio")}
              </Link>
            )}
          </div>
          <TrackList
            tracks={artist.tracks}
            onLike={like}
            onRemove={artist.isOwner ? deleteTrack : undefined}
            removeLabel={artist.isOwner ? t("music.studio.deleteTrack") : undefined}
            showArtist={false}
            showAlbum
            emptyTitle={t("music.artistDetail.noTracks")}
          />
        </section>
      </main>
    </div>
  );
}
