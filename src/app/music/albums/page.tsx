"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, Disc3 } from "lucide-react";

type AlbumSummary = {
  id: string;
  title: string;
  coverUrl: string | null;
  artist: { id: string; displayName: string };
  _count: { tracks: number };
};

export default function MusicAlbumsPage() {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`/api/music/albums${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then(setAlbums)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [q]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/music" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Back to Music">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-black text-lg">Albums</div>

          <div className="relative flex-1 max-w-xl ml-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search albums..."
              aria-label="Search albums"
              className="w-full h-10 pl-11 pr-4 rounded-full bg-gray-100 dark:bg-white/[0.07] border border-transparent focus:border-zrp-red/40 outline-none transition text-sm"
            />
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
          </div>
        ) : !albums.length ? (
          <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-20 text-center">
            <Disc3 className="w-10 h-10 mx-auto text-gray-300 dark:text-white/20" />
            <div className="font-bold mt-4">No albums found</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {albums.map((album) => (
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
                  <div className="text-xs text-gray-500 truncate">{album.artist.displayName}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
