"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, ShieldCheck, Music2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type ArtistSummary = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  verified: boolean;
  _count: { tracks: number; followers: number };
};

export default function MusicArtistsPage() {
  const { t } = useLanguage();
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`/api/music/artists${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then(setArtists)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  }, [q]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/music" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label={t("music.common.backToMusic")}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-black text-lg">{t("music.artists.title")}</div>

          <div className="relative flex-1 max-w-xl ml-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("music.artists.searchPlaceholder")}
              aria-label={t("music.artists.searchPlaceholder")}
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
        ) : !artists.length ? (
          <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-20 text-center">
            <Music2 className="w-10 h-10 mx-auto text-gray-300 dark:text-white/20" />
            <div className="font-bold mt-4">{t("music.artists.noneFound")}</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {artists.map((artist) => (
              <Link
                key={artist.id}
                href={`/music/artists/${artist.id}`}
                className="group rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.035] p-4 hover:border-zrp-red/30 hover:bg-zrp-red/[0.03] transition text-center"
              >
                <img
                  src={artist.avatarUrl || "/logo.png"}
                  alt=""
                  className="w-20 h-20 rounded-full object-cover mx-auto"
                />
                <div className="font-bold mt-3 truncate flex items-center justify-center gap-1">
                  {artist.displayName}
                  {artist.verified && <ShieldCheck className="w-4 h-4 text-zrp-red shrink-0" />}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {t(artist._count.tracks === 1 ? "music.count.tracksOne" : "music.count.tracksOther", { count: artist._count.tracks })}
                  {" · "}
                  {t(artist._count.followers === 1 ? "music.count.followersOne" : "music.count.followersOther", { count: artist._count.followers })}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
