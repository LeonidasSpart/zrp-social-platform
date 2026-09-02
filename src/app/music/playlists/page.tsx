"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ListMusic, Plus, X } from "lucide-react";

type PlaylistSummary = {
  id: string;
  name: string;
  coverUrl: string | null;
  isPublic: boolean;
  tracks: Array<{ track: { coverUrl: string | null; album: { coverUrl: string | null } | null } }>;
};

export default function MusicPlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/music/playlists", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setPlaylists)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const createPlaylist = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/music/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (res.ok) {
      setName("");
      setCreating(false);
      load();
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/music" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Back to Music">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-black text-lg">Your Playlists</div>

          <button
            type="button"
            onClick={() => setCreating(true)}
            className="ml-auto h-9 px-4 rounded-full bg-zrp-red text-white text-sm font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> New playlist
          </button>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {creating && (
          <div className="mb-6 rounded-2xl border border-gray-200 dark:border-white/10 p-4 flex items-center gap-3">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
              placeholder="Playlist name"
              className="flex-1 p-2.5 rounded-xl bg-gray-100 dark:bg-white/[0.06] border border-transparent focus:border-zrp-red/40 outline-none"
            />
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={createPlaylist}
              className="h-10 px-4 rounded-full bg-zrp-red text-white font-bold disabled:opacity-40"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setName("");
              }}
              className="w-10 h-10 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
          </div>
        ) : !playlists.length ? (
          <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-20 text-center">
            <ListMusic className="w-10 h-10 mx-auto text-gray-300 dark:text-white/20" />
            <div className="font-bold mt-4">No playlists yet</div>
            <div className="text-sm text-gray-500 mt-2">Create your first playlist to start organizing tracks.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {playlists.map((playlist) => {
              const cover =
                playlist.coverUrl ||
                playlist.tracks[0]?.track.coverUrl ||
                playlist.tracks[0]?.track.album?.coverUrl ||
                "/logo.png";

              return (
                <Link
                  key={playlist.id}
                  href={`/music/playlists/${playlist.id}`}
                  className="group rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.035] overflow-hidden hover:border-zrp-red/30 transition"
                >
                  <div className="aspect-square bg-gray-200 dark:bg-white/5 overflow-hidden">
                    <img src={cover} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-3">
                    <div className="font-bold truncate">{playlist.name}</div>
                    <div className="text-xs text-gray-500">{playlist.tracks.length} track{playlist.tracks.length === 1 ? "" : "s"}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
