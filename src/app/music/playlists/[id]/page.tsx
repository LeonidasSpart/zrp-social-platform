"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Shuffle, Pencil, Trash2, ArrowUp, ArrowDown, ListMusic, Check, X } from "lucide-react";
import { useMusicPlayer, type MusicTrack } from "@/components/music/MusicPlayerProvider";
import { useLanguage } from "@/contexts/LanguageContext";
import { sumDurationSec, formatTotalDuration } from "@/lib/music/duration";

type PlaylistTrackRow = { id: string; position: number; track: MusicTrack };

type PlaylistDetail = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isOwner: boolean;
  tracks: PlaylistTrackRow[];
};

export default function MusicPlaylistDetailPage() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const { play, addToQueue, clearQueue } = useMusicPlayer();

  const load = useCallback(async () => {
    const res = await fetch(`/api/music/playlists/${params.id}`, { cache: "no-store" });
    if (res.ok) setPlaylist(await res.json());
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveName = async () => {
    if (!playlist || !nameDraft.trim()) return setEditingName(false);
    const res = await fetch(`/api/music/playlists/${playlist.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameDraft.trim() }),
    });
    if (res.ok) setPlaylist((prev) => (prev ? { ...prev, name: nameDraft.trim() } : prev));
    setEditingName(false);
  };

  const deletePlaylist = async () => {
    if (!playlist) return;
    if (!confirm(t("music.playlistDetail.deleteConfirm", { name: playlist.name }))) return;
    const res = await fetch(`/api/music/playlists/${playlist.id}`, { method: "DELETE" });
    if (res.ok) router.push("/music/playlists");
  };

  const removeTrack = async (trackId: string) => {
    if (!playlist) return;
    const res = await fetch(`/api/music/playlists/${playlist.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId }),
    });
    if (res.ok) load();
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!playlist) return;
    const target = index + direction;
    if (target < 0 || target >= playlist.tracks.length) return;

    const reordered = [...playlist.tracks];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setPlaylist({ ...playlist, tracks: reordered });

    await fetch(`/api/music/playlists/${playlist.id}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: reordered.map((r) => r.id) }),
    });
  };

  const playAll = (shuffle = false) => {
    if (!playlist?.tracks.length) return;
    const ordered = shuffle ? [...playlist.tracks].sort(() => Math.random() - 0.5) : playlist.tracks;
    clearQueue();
    play(ordered[0].track);
    ordered.slice(1).forEach((r) => addToQueue(r.track));
  };

  const playlistDurationSec = playlist ? sumDurationSec(playlist.tracks.map((r) => r.track)) : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#050505]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white dark:bg-[#050505] text-gray-950 dark:text-white">
        <div className="font-bold">{t("music.playlistDetail.notFound")}</div>
        <Link href="/music/playlists" className="text-zrp-red text-sm">{t("music.playlistDetail.backToPlaylists")}</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/music/playlists" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label={t("music.playlistDetail.backToPlaylists")}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-black text-lg truncate">{playlist.name}</div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        <section className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
          <div className="w-40 h-40 sm:w-52 sm:h-52 rounded-2xl overflow-hidden bg-gray-200 dark:bg-white/5 shrink-0 shadow-xl flex items-center justify-center">
            {playlist.tracks[0] ? (
              <img
                src={playlist.tracks[0].track.coverUrl || playlist.tracks[0].track.album?.coverUrl || "/logo.png"}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <ListMusic className="w-14 h-14 text-gray-300 dark:text-white/20" />
            )}
          </div>

          <div className="min-w-0 text-center sm:text-left flex-1">
            <div className="text-xs uppercase tracking-[0.2em] text-zrp-red font-bold">
              {playlist.isPublic ? t("music.playlistDetail.public") : t("music.playlistDetail.private")}
            </div>

            {editingName ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  className="text-2xl sm:text-3xl font-black bg-transparent border-b-2 border-zrp-red outline-none"
                />
                <button type="button" onClick={saveName} aria-label={t("music.playlistDetail.saveAria")} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center">
                  <Check className="w-4 h-4 text-zrp-red" />
                </button>
                <button type="button" onClick={() => setEditingName(false)} aria-label={t("music.playlists.cancelAria")} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <h1 className="text-2xl sm:text-4xl font-black mt-1 flex items-center justify-center sm:justify-start gap-2">
                {playlist.name}
                {playlist.isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(playlist.name);
                      setEditingName(true);
                    }}
                    aria-label={t("music.playlistDetail.renameAria")}
                    className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center"
                  >
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </h1>
            )}

            <div className="text-sm text-gray-500 mt-2">
              {t(playlist.tracks.length === 1 ? "music.count.tracksOne" : "music.count.tracksOther", { count: playlist.tracks.length })}
              {playlist.tracks.length > 0 && playlistDurationSec > 0 && ` • ${formatTotalDuration(playlistDurationSec, t)}`}
            </div>

            <div className="flex flex-wrap justify-center sm:justify-start gap-3 mt-5">
              <button
                type="button"
                onClick={() => playAll(false)}
                disabled={!playlist.tracks.length}
                className="h-11 px-5 rounded-full bg-zrp-red text-white font-bold flex items-center gap-2 disabled:opacity-40"
              >
                <Play className="w-4 h-4 fill-current" /> {t("music.common.play")}
              </button>
              <button
                type="button"
                onClick={() => playAll(true)}
                disabled={!playlist.tracks.length}
                className="h-11 px-5 rounded-full bg-gray-100 dark:bg-white/10 font-bold flex items-center gap-2 disabled:opacity-40"
              >
                <Shuffle className="w-4 h-4" /> {t("music.common.shuffle")}
              </button>
              {playlist.isOwner && (
                <button
                  type="button"
                  onClick={deletePlaylist}
                  className="h-11 px-5 rounded-full border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 font-bold flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> {t("music.playlistDetail.delete")}
                </button>
              )}
            </div>
          </div>
        </section>

        {!playlist.tracks.length ? (
          <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-16 text-center">
            <div className="font-bold">{t("music.playlistDetail.emptyTitle")}</div>
            <div className="text-sm text-gray-500 mt-2">{t("music.playlistDetail.emptyBody")}</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/[0.02]">
            {playlist.tracks.map((row, index) => (
              <div key={row.id} className="flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-white/[0.04]">
                {playlist.isOwner && (
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={t("music.playlistDetail.moveUpAria")}
                      className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-zrp-red disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === playlist.tracks.length - 1}
                      aria-label={t("music.playlistDetail.moveDownAria")}
                      className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-zrp-red disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    // Same fix as the other track lists: seed the
                    // queue with the rest of the playlist so Next/
                    // Previous have somewhere to go after playing a
                    // track picked directly instead of via Play all.
                    clearQueue();
                    play(row.track);
                    playlist.tracks.slice(index + 1).forEach((r) => addToQueue(r.track));
                  }}
                  className="shrink-0 w-11 h-11 rounded-lg overflow-hidden"
                  aria-label={t("music.shell.playTrackAria", { title: row.track.title })}
                >
                  <img
                    src={row.track.coverUrl || row.track.album?.coverUrl || "/logo.png"}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>

                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{row.track.title}</div>
                  <div className="text-xs text-gray-500 truncate">{row.track.artist.displayName}</div>
                </div>

                <button
                  type="button"
                  onClick={() => addToQueue(row.track)}
                  className="w-8 h-8 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 flex items-center justify-center shrink-0"
                  aria-label={t("music.common.addToQueue")}
                >
                  <ListMusic className="w-4 h-4 text-gray-400" />
                </button>

                {playlist.isOwner && (
                  <button
                    type="button"
                    onClick={() => removeTrack(row.track.id)}
                    className="w-8 h-8 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center shrink-0"
                    aria-label={t("music.playlistDetail.removeTrackAria", { title: row.track.title })}
                  >
                    <Trash2 className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
