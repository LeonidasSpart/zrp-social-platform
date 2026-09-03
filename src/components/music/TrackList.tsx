"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Heart, ListPlus, ListStart, Pause, Play, Trash2, FolderPlus, Check } from "lucide-react";
import Link from "next/link";
import { useMusicPlayer, type MusicTrack } from "./MusicPlayerProvider";
import { useLanguage } from "@/contexts/LanguageContext";

type MyPlaylist = { id: string; name: string };

function formatDuration(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TrackList({
  tracks,
  onLike,
  onRemove,
  removeLabel,
  showIndex = true,
  showArtist = true,
  showAlbum = false,
  emptyTitle,
  emptyDescription,
}: {
  tracks: MusicTrack[];
  onLike?: (trackId: string) => void;
  onRemove?: (trackId: string) => void;
  removeLabel?: string;
  showIndex?: boolean;
  showArtist?: boolean;
  showAlbum?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { t } = useLanguage();
  const { current, playing, play, pause, addToQueue, playNext, clearQueue } = useMusicPlayer();
  const { data: session } = useSession();
  const [myPlaylists, setMyPlaylists] = useState<MyPlaylist[]>([]);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [addedTo, setAddedTo] = useState<Record<string, true>>({});

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/music/playlists", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MyPlaylist[]) => setMyPlaylists(data.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, [session?.user]);

  const addTrackToPlaylist = async (playlistId: string, trackId: string) => {
    const res = await fetch(`/api/music/playlists/${playlistId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId }),
    });
    if (res.ok) {
      setAddedTo((prev) => ({ ...prev, [`${playlistId}:${trackId}`]: true }));
    }
  };

  if (!tracks.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-16 text-center">
        <div className="font-bold">{emptyTitle ?? t("music.track.emptyDefaultTitle")}</div>
        {emptyDescription && (
          <div className="text-sm text-gray-500 mt-2">{emptyDescription}</div>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/[0.02]">
      {tracks.map((track, index) => {
        const isCurrent = current?.id === track.id;
        const cover = track.coverUrl || track.album?.coverUrl || "/logo.png";

        return (
          <div
            key={track.id}
            className={`group flex items-center gap-3 px-3 sm:px-4 py-2.5 transition ${
              isCurrent ? "bg-zrp-red/5" : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
            }`}
          >
            {showIndex && (
              <div className="w-6 text-center text-xs text-gray-400 shrink-0">
                {String(index + 1).padStart(2, "0")}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (isCurrent && playing) {
                  pause();
                  return;
                }
                // Starting a track from this list queues the rest of
                // the list behind it, the same way "Play all" does -
                // without this, Next/Previous had nothing to advance
                // to whenever someone played a track by clicking it
                // directly instead of using Play all first.
                clearQueue();
                play(track);
                tracks.slice(index + 1).forEach((t) => addToQueue(t));
              }}
              className="relative shrink-0 w-11 h-11 rounded-lg overflow-hidden"
              aria-label={
                isCurrent && playing
                  ? t("music.track.pauseAria", { title: track.title })
                  : t("music.shell.playTrackAria", { title: track.title })
              }
            >
              <img src={cover} alt="" className="w-full h-full object-cover" />
              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                {isCurrent && playing ? (
                  <Pause className="w-4 h-4 text-white fill-white" />
                ) : (
                  <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                )}
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <div className={`font-semibold truncate ${isCurrent ? "text-zrp-red" : ""}`}>
                {track.title}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {showArtist && (
                  <Link
                    href={`/music/artists/${track.artist.id}`}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {track.artist.displayName}
                  </Link>
                )}
                {showAlbum && track.album?.title ? ` • ${track.album.title}` : ""}
              </div>
            </div>

            {track.genre && (
              <span className="hidden sm:inline-block text-[11px] px-2 py-1 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 shrink-0">
                {track.genre}
              </span>
            )}

            <div className="text-xs text-gray-400 w-10 text-right shrink-0 hidden sm:block">
              {formatDuration(track.durationSec)}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {onLike && (
                <button
                  type="button"
                  onClick={() => onLike(track.id)}
                  className="w-8 h-8 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 flex items-center justify-center"
                  aria-label={track.liked ? t("music.common.unlike") : t("music.common.like")}
                >
                  <Heart className={`w-4 h-4 ${track.liked ? "fill-zrp-red text-zrp-red" : "text-gray-400"}`} />
                </button>
              )}

              <button
                type="button"
                onClick={() => playNext(track)}
                className="w-8 h-8 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 hidden sm:flex items-center justify-center"
                aria-label={t("music.common.playNext")}
                title={t("music.common.playNext")}
              >
                <ListStart className="w-4 h-4 text-gray-400" />
              </button>

              <button
                type="button"
                onClick={() => addToQueue(track)}
                className="w-8 h-8 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 flex items-center justify-center"
                aria-label={t("music.common.addToQueue")}
                title={t("music.common.addToQueue")}
              >
                <ListPlus className="w-4 h-4 text-gray-400" />
              </button>

              {session?.user && myPlaylists.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenMenuFor((prev) => (prev === track.id ? null : track.id))}
                    className="w-8 h-8 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 hidden sm:flex items-center justify-center"
                    aria-label={t("music.common.addToPlaylist")}
                    title={t("music.common.addToPlaylist")}
                  >
                    <FolderPlus className="w-4 h-4 text-gray-400" />
                  </button>

                  {openMenuFor === track.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setOpenMenuFor(null)} />
                      <div className="absolute right-0 top-full mt-1 w-52 max-h-64 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                        {myPlaylists.map((playlist) => {
                          const key = `${playlist.id}:${track.id}`;
                          return (
                            <button
                              type="button"
                              key={playlist.id}
                              onClick={() => addTrackToPlaylist(playlist.id, track.id)}
                              className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                            >
                              <span className="truncate">{playlist.name}</span>
                              {addedTo[key] && <Check className="w-3.5 h-3.5 text-zrp-red shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(track.id)}
                  className="w-8 h-8 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
                  aria-label={removeLabel ?? t("music.common.remove")}
                  title={removeLabel ?? t("music.common.remove")}
                >
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
