"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Heart, ListPlus, Play, Search, UploadCloud, Disc3, Music2, Sparkles,
  ChevronRight, Compass, Users, ListMusic, History,
} from "lucide-react";
import { useMusicPlayer, type MusicTrack } from "./MusicPlayerProvider";
import MusicStudio, { type StudioTab } from "./MusicStudio";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MusicShell() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [matchingAlbums, setMatchingAlbums] = useState<
    { id: string; title: string; coverUrl: string | null; artist: { displayName: string } }[]
  >([]);
  const [q, setQ] = useState("");
  const [studio, setStudio] = useState(false);
  const { play, addToQueue } = useMusicPlayer();

  // Lets other pages (the artist page's "Edit Profile"/"Manage in
  // Studio" links, most notably) deep-link straight into Studio
  // instead of duplicating its edit UI elsewhere - reuses the one
  // existing Studio rather than building a second management surface.
  const studioParam = searchParams.get("studio");
  const tabParam = searchParams.get("tab") as StudioTab | null;
  useEffect(() => {
    if (studioParam === "1") setStudio(true);
  }, [studioParam]);

  async function load() {
    const res = await fetch(`/api/music/tracks${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
    if (res.ok) setTracks(await res.json());
  }
  useEffect(() => { load(); }, [q]);

  // The main search bar only ever queried tracks (matched by title,
  // genre, or artist name) - a search for an album title turned up
  // nothing here even though /api/music/albums already supports the
  // same ?q= search. Surfacing album matches alongside track results
  // reuses that existing endpoint rather than building new search
  // infrastructure.
  useEffect(() => {
    if (!q) {
      setMatchingAlbums([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/music/albums?q=${encodeURIComponent(q)}&limit=6`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setMatchingAlbums(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [q]);

  const like = async (id: string) => {
    const res = await fetch("/api/music/tracks/like", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({trackId:id})});
    if (res.ok) load();
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      {/* Premium header */}
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-zrp-red text-white flex items-center justify-center shadow-lg shadow-red-500/20">
                <Music2 className="w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <div className="font-black tracking-tight leading-none">
                  <span className="text-zrp-red">ZRP</span> Music
                </div>
                <div className="text-[9px] uppercase tracking-[0.22em] text-gray-400 mt-1">
                  {t("music.shell.tagline")}
                </div>
              </div>
            </div>

            <div className="relative flex-1 max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("music.shell.searchPlaceholder")}
                className="w-full h-11 pl-11 pr-4 rounded-full bg-gray-100 dark:bg-white/[0.07] border border-transparent focus:border-zrp-red/40 outline-none transition text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => setStudio((v) => !v)}
              className="shrink-0 h-11 px-4 sm:px-5 rounded-full bg-zrp-red text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-red-500/20 active:scale-95 transition"
            >
              <UploadCloud className="w-4 h-4" />
              <span className="hidden sm:inline">{t("music.shell.studioLabel")}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[28px] bg-[#090909] text-white border border-white/10">
          <div className="absolute -right-32 -top-32 w-96 h-96 rounded-full bg-zrp-red/30 blur-3xl" />
          <div className="absolute -left-20 -bottom-40 w-80 h-80 rounded-full bg-red-900/20 blur-3xl" />

          <div className="relative grid lg:grid-cols-[1.25fr_.75fr] gap-8 p-7 sm:p-10 lg:p-12">
            <div className="flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 w-fit px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs text-white/70">
                <Sparkles className="w-3.5 h-3.5 text-zrp-red" />
                {t("music.shell.heroEyebrow")}
              </div>

              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95]">
                {t("music.shell.heroTitleLine1")}
                <span className="block text-zrp-red">{t("music.shell.heroTitleLine2")}</span>
              </h1>

              <p className="mt-5 max-w-xl text-white/55 text-sm sm:text-base leading-relaxed">
                {t("music.shell.heroSubtitle")}
              </p>

              <div className="flex flex-wrap gap-3 mt-7">
                <button
                  type="button"
                  onClick={() => tracks[0] && play(tracks[0])}
                  disabled={!tracks.length}
                  className="h-12 px-6 rounded-full bg-zrp-red text-white font-bold flex items-center gap-2 disabled:opacity-40 active:scale-95 transition"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {t("music.shell.playSomething")}
                </button>

                <button
                  type="button"
                  onClick={() => setStudio(true)}
                  className="h-12 px-6 rounded-full bg-white/10 border border-white/10 font-semibold flex items-center gap-2 hover:bg-white/15 transition"
                >
                  <UploadCloud className="w-4 h-4" />
                  {t("music.shell.uploadMusic")}
                </button>
              </div>
            </div>

            <div className="hidden lg:flex items-center justify-center">
              <div className="relative w-72 h-72">
                <div className="absolute inset-8 rounded-full bg-zrp-red/25 blur-3xl" />
                <div className="absolute inset-0 rounded-full border border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent" />
                <div className="absolute inset-8 rounded-full border border-white/10 bg-[#111] flex items-center justify-center">
                  <Disc3 className="w-28 h-28 text-white/80 animate-[spin_12s_linear_infinite]" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-zrp-red flex items-center justify-center shadow-2xl shadow-red-500/30">
                    <Music2 className="w-6 h-6" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Studio */}
        {studio && (
          <MusicStudio
            onClose={() => setStudio(false)}
            onTrackChange={load}
            initialTab={tabParam || undefined}
          />
        )}

        {/* Quick navigation */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            [t("music.nav.discoverTitle"), t("music.nav.discoverDesc"), Compass, "/music/discover"],
            [t("music.nav.albumsTitle"), t("music.nav.albumsDesc"), Disc3, "/music/albums"],
            [t("music.nav.artistsTitle"), t("music.nav.artistsDesc"), Users, "/music/artists"],
            [t("music.nav.queueTitle"), t("music.nav.queueDesc"), ListPlus, "/music/queue"],
            [t("music.nav.likedTitle"), t("music.nav.likedDesc"), Heart, "/music/liked"],
            [t("music.nav.playlistsTitle"), t("music.nav.playlistsDesc"), ListMusic, "/music/playlists"],
            [t("music.nav.historyTitle"), t("music.nav.historyDesc"), History, "/music/history"],
          ].map(([name, description, Icon, href]) => (
            <Link
              key={String(href)}
              href={String(href)}
              className="group text-left rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.035] p-4 hover:border-zrp-red/30 hover:bg-zrp-red/[0.03] transition"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-white/10 flex items-center justify-center group-hover:bg-zrp-red group-hover:text-white transition">
                {(() => {
                  const IconComponent = Icon as React.ElementType;
                  return <IconComponent className="w-5 h-5" />;
                })()}
              </div>
              <div className="font-bold mt-3">{String(name)}</div>
              <div className="text-xs text-gray-500 mt-1">{String(description)}</div>
            </Link>
          ))}
        </section>

        {/* Matching albums (search) */}
        {q && matchingAlbums.length > 0 && (
          <section>
            <h2 className="text-lg font-black mb-3">{t("music.shell.matchingAlbumsHeading")}</h2>
            <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
              {matchingAlbums.map((album) => (
                <Link
                  key={album.id}
                  href={`/music/albums/${album.id}`}
                  className="shrink-0 w-32 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.035] overflow-hidden hover:border-zrp-red/30 transition"
                >
                  <div className="aspect-square bg-gray-200 dark:bg-white/5">
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="w-8 h-8 text-gray-300 dark:text-white/20" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="text-sm font-bold truncate">{album.title}</div>
                    <div className="text-xs text-gray-500 truncate">{album.artist.displayName}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Discover */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-zrp-red font-bold">
                {t("music.shell.listenNowEyebrow")}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black mt-1">
                {t("music.shell.discoverMusicTitle")}
              </h2>
            </div>

            <div className="text-xs text-gray-500">
              {t(tracks.length === 1 ? "music.count.tracksOne" : "music.count.tracksOther", { count: tracks.length })}
            </div>
          </div>

          {!tracks.length ? (
            <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-20 text-center">
              <Music2 className="w-10 h-10 mx-auto text-gray-300 dark:text-white/20" />
              <div className="font-bold mt-4">{t("music.shell.emptyTitle")}</div>
              <div className="text-sm text-gray-500 mt-2">
                {t("music.shell.emptyBody")}
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {tracks.map((track, index) => {
                const cover = track.coverUrl || track.album?.coverUrl || "/logo.png";

                return (
                  <article
                    key={track.id}
                    className="group relative overflow-hidden rounded-[22px] border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.035] hover:-translate-y-1 hover:border-zrp-red/30 transition-all duration-300"
                  >
                    <div className="relative aspect-[1.55] overflow-hidden bg-gray-200 dark:bg-white/5">
                      <img
                        src={cover}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur text-[10px] text-white/80">
                        #{String(index + 1).padStart(2, "0")}
                      </div>

                      <button
                        type="button"
                        onClick={() => play(track)}
                        className="absolute bottom-4 left-4 w-12 h-12 rounded-full bg-zrp-red text-white flex items-center justify-center shadow-xl shadow-black/30 active:scale-95 transition"
                        aria-label={t("music.shell.playTrackAria", { title: track.title })}
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => addToQueue(track)}
                        className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition"
                        aria-label={t("music.common.addToQueue")}
                      >
                        <ListPlus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold truncate">{track.title}</h3>
                          <p className="text-sm text-gray-500 truncate mt-1">
                            {track.artist.displayName}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => like(track.id)}
                          className="shrink-0 w-9 h-9 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 flex items-center justify-center"
                          aria-label={track.liked ? t("music.common.unlike") : t("music.common.like")}
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              track.liked
                                ? "fill-zrp-red text-zrp-red"
                                : "text-gray-400"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-3 text-[11px] text-gray-500">
                        {track.genre && (
                          <span className="px-2.5 py-1 rounded-full bg-gray-200 dark:bg-white/10">
                            {track.genre}
                          </span>
                        )}

                        {track.album?.title && (
                          <span className="truncate">
                            {track.album.title}
                          </span>
                        )}

                        <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )

}
