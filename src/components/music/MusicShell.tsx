"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Heart, ListPlus, Play, Search, UploadCloud, Disc3, Music2, Sparkles,
  ChevronRight, Lock, Compass, Users, ListMusic, History,
} from "lucide-react";
import { useMusicPlayer, type MusicTrack } from "./MusicPlayerProvider";
import { useUploadThing } from "@/lib/uploadthing-client";

type MusicAccess = {
  allowed: boolean;
  isCreator: boolean;
  isVerifiedArtist: boolean;
  hasArtistProfile: boolean;
  reason?: string;
};

export default function MusicShell() {
  const { data: session } = useSession();
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [q, setQ] = useState("");
  const [studio, setStudio] = useState(false);
  const [artistName, setArtistName] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [access, setAccess] = useState<MusicAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [applyName, setApplyName] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);
  const { play, addToQueue } = useMusicPlayer();
  const { startUpload: uploadMusic } = useUploadThing("musicTrack", {
    onClientUploadComplete: async (files) => {
      if (!files?.length) return;
      const audioFile = files.find(f => f.serverData?.type === "audio") || files[0];
      const imageFile = files.find(f => f.serverData?.type === "image");
      const artistRes = await fetch("/api/music/artists", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ displayName: artistName || undefined }),
      });
      const artist = await artistRes.json();
      const trackRes = await fetch("/api/music/tracks", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ title, genre, audioUrl: audioFile.ufsUrl, audioKey: audioFile.key, coverUrl: imageFile?.ufsUrl || null, artistId: artist.id }),
      });
      if (!trackRes.ok) {
        const data = await trackRes.json().catch(() => ({}));
        setUploadError(data.error || "Publishing failed. Please try again.");
        setBusy(false);
        return;
      }
      setBusy(false); setAudio(null); setCover(null); setTitle(""); setStudio(false);
      load();
    },
    onUploadError: (err) => {
      setUploadError(err.message || "Upload failed. Please try again.");
      setBusy(false);
    },
  });

  async function load() {
    const res = await fetch(`/api/music/tracks${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
    if (res.ok) setTracks(await res.json());
  }
  useEffect(() => { load(); }, [q]);

  async function loadAccess() {
    setAccessLoading(true);
    try {
      const res = await fetch("/api/music/access", { cache: "no-store" });
      if (res.ok) setAccess(await res.json());
    } finally {
      setAccessLoading(false);
    }
  }
  useEffect(() => {
    if (session?.user) loadAccess();
    else {
      setAccess(null);
      setAccessLoading(false);
    }
  }, [session?.user]);

  const submit = async () => {
    if (!audio || !title) return;
    setUploadError(null);
    setBusy(true);
    const files = cover ? [audio, cover] : [audio];
    await uploadMusic(files);
  };

  const applyForArtist = async () => {
    if (!applyName.trim()) return;
    setApplyBusy(true);
    const res = await fetch("/api/music/artists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: applyName.trim() }),
    });
    setApplyBusy(false);
    if (res.ok) {
      setApplyName("");
      loadAccess();
    }
  };

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
                  Your sound. Your world.
                </div>
              </div>
            </div>

            <div className="relative flex-1 max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search songs, artists, albums..."
                className="w-full h-11 pl-11 pr-4 rounded-full bg-gray-100 dark:bg-white/[0.07] border border-transparent focus:border-zrp-red/40 outline-none transition text-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => setStudio((v) => !v)}
              className="shrink-0 h-11 px-4 sm:px-5 rounded-full bg-zrp-red text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-red-500/20 active:scale-95 transition"
            >
              <UploadCloud className="w-4 h-4" />
              <span className="hidden sm:inline">Music Studio</span>
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
                Discover something new
              </div>

              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[0.95]">
                Music without
                <span className="block text-zrp-red">boundaries.</span>
              </h1>

              <p className="mt-5 max-w-xl text-white/55 text-sm sm:text-base leading-relaxed">
                Discover independent artists, listen to your favorite tracks,
                build your queue and experience music inside ZRP.
              </p>

              <div className="flex flex-wrap gap-3 mt-7">
                <button
                  type="button"
                  onClick={() => tracks[0] && play(tracks[0])}
                  disabled={!tracks.length}
                  className="h-12 px-6 rounded-full bg-zrp-red text-white font-bold flex items-center gap-2 disabled:opacity-40 active:scale-95 transition"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Play something
                </button>

                <button
                  type="button"
                  onClick={() => setStudio(true)}
                  className="h-12 px-6 rounded-full bg-white/10 border border-white/10 font-semibold flex items-center gap-2 hover:bg-white/15 transition"
                >
                  <UploadCloud className="w-4 h-4" />
                  Upload music
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
          <section className="rounded-[24px] border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/[0.035] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-zrp-red font-bold">
                  Creator tools
                </div>
                <h2 className="text-2xl font-black mt-1">Music Studio</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Publish your music directly to ZRP.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStudio(false)}
                className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            {!session?.user ? (
              <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/30 p-6 text-center">
                <Lock className="w-8 h-8 mx-auto text-gray-400" />
                <div className="font-bold mt-3">Sign in to publish music</div>
                <p className="text-sm text-gray-500 mt-1">
                  Listening to ZRP Music is open to everyone. You&apos;ll need to sign in to apply for publishing access.
                </p>
              </div>
            ) : accessLoading ? (
              <div className="py-10 flex justify-center">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-zrp-red border-t-transparent" />
              </div>
            ) : !access?.allowed ? (
              <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/30 p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <div className="font-bold">Music Studio - Artist or Creator status required</div>
                    <p className="text-sm text-gray-500 mt-1">
                      Listening to ZRP Music is open to everyone. Publishing music requires
                      an approved Creator status or a verified Music Artist profile.
                    </p>
                  </div>
                </div>

                {access?.hasArtistProfile ? (
                  <div className="mt-5 text-sm rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 p-3.5">
                    Your artist profile has been submitted and is awaiting verification from ZRP staff.
                  </div>
                ) : (
                  <div className="mt-5">
                    <p className="text-sm text-gray-500 mb-2">
                      Create an artist profile to apply for Music Artist verification, or
                      <Link href="/settings" className="text-zrp-red hover:underline"> apply for Creator status</Link> from your settings.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={applyName}
                        onChange={(e) => setApplyName(e.target.value)}
                        placeholder="Artist name"
                        className="flex-1 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.05] border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
                      />
                      <button
                        type="button"
                        disabled={applyBusy || !applyName.trim()}
                        onClick={applyForArtist}
                        className="h-11 px-5 rounded-xl bg-zrp-red text-white font-bold disabled:opacity-40 shrink-0"
                      >
                        {applyBusy ? "Submitting..." : "Apply as Artist"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                    placeholder="Artist name"
                    className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
                  />

                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Song title"
                    className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
                  />

                  <input
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    placeholder="Genre"
                    className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 outline-none focus:border-zrp-red/50"
                  />

                  <label className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 cursor-pointer text-sm text-gray-500">
                    Audio file
                    <input
                      type="file"
                      accept=".mp3,.wav,.m4a,.aac,.aiff,.flac,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/aiff,audio/flac,audio/ogg"
                      className="block mt-2 w-full text-xs"
                      onChange={(e) => setAudio(e.target.files?.[0] || null)}
                    />
                  </label>

                  <label className="p-3.5 rounded-xl bg-white dark:bg-black/30 border border-gray-200 dark:border-white/10 cursor-pointer text-sm text-gray-500">
                    Cover artwork
                    <input
                      type="file"
                      accept="image/*"
                      className="block mt-2 w-full text-xs"
                      onChange={(e) => setCover(e.target.files?.[0] || null)}
                    />
                  </label>

                  <button
                    disabled={busy || !audio || !title}
                    onClick={submit}
                    className="sm:col-span-2 h-12 rounded-xl bg-zrp-red text-white font-bold disabled:opacity-40"
                  >
                    {busy ? "Publishing..." : "Publish track"}
                  </button>
                </div>

                {uploadError && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-3">
                    {uploadError}
                  </p>
                )}

                <p className="text-xs text-gray-500 mt-3">
                  Audio and artwork are uploaded directly to your existing ZRP storage.
                </p>
              </>
            )}
          </section>
        )}

        {/* Quick navigation */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ["Discover", "Fresh music for you", Compass, "/music/discover"],
            ["Albums", "Full releases", Disc3, "/music/albums"],
            ["Artists", "Find new voices", Users, "/music/artists"],
            ["Your Queue", "What plays next", ListPlus, "/music/queue"],
            ["Liked Music", "Tracks you saved", Heart, "/music/liked"],
            ["Playlists", "Your collections", ListMusic, "/music/playlists"],
            ["Recently Played", "Pick up where you left off", History, "/music/history"],
          ].map(([name, description, Icon, href]) => (
            <Link
              key={String(name)}
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

        {/* Discover */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-zrp-red font-bold">
                Listen now
              </div>
              <h2 className="text-2xl sm:text-3xl font-black mt-1">
                Discover music
              </h2>
            </div>

            <div className="text-xs text-gray-500">
              {tracks.length} track{tracks.length === 1 ? "" : "s"}
            </div>
          </div>

          {!tracks.length ? (
            <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-20 text-center">
              <Music2 className="w-10 h-10 mx-auto text-gray-300 dark:text-white/20" />
              <div className="font-bold mt-4">Your music universe starts here</div>
              <div className="text-sm text-gray-500 mt-2">
                Upload the first song from Music Studio.
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
                        aria-label={`Play ${track.title}`}
                      >
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => addToQueue(track)}
                        className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition"
                        aria-label="Add to queue"
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
                          aria-label="Like"
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
