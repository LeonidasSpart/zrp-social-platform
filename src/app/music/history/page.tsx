"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import TrackList from "@/components/music/TrackList";
import { type MusicTrack } from "@/components/music/MusicPlayerProvider";

export default function MusicHistoryPage() {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/music/library", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { history: [], likes: [] }))
      .then((data) => {
        const likedIds = new Set<string>((data.likes || []).map((l: { trackId: string }) => l.trackId));
        const seen = new Set<string>();
        const recent: MusicTrack[] = [];
        for (const entry of data.history || []) {
          if (seen.has(entry.track.id)) continue;
          seen.add(entry.track.id);
          recent.push({ ...entry.track, liked: likedIds.has(entry.track.id) });
        }
        setTracks(recent);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/music" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Back to Music">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-black text-lg">Recently Played</div>
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
            onLike={like}
            showAlbum
            showIndex={false}
            emptyTitle="No listening history yet"
            emptyDescription="Tracks you play will show up here."
          />
        )}
      </main>
    </div>
  );
}
