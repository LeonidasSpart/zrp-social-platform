"use client";

import {
  ListMusic,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  X,
} from "lucide-react";
import { useState } from "react";
import { useMusicPlayer } from "./MusicPlayerProvider";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function MusicMiniPlayer() {
  const {
    current,
    playing,
    progress,
    duration,
    volume,
    muted,
    shuffle,
    repeat,
    buffering,
    error,
    play,
    pause,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    queue,
  } = useMusicPlayer();

  const [expanded, setExpanded] = useState(false);

  if (!current) return null;

  const cover =
    current.coverUrl ||
    current.album?.coverUrl ||
    "/logo.png";

  const remaining = Math.max(0, duration - progress);

  return (
    <>
      {/* Expanded Now Playing */}
      {expanded && (
        <div className="fixed inset-0 z-[10000] bg-black text-white overflow-y-auto">
          <div className="min-h-full flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between px-5 pt-[max(18px,env(safe-area-inset-top))] pb-4">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition"
                aria-label="Close player"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center">
                <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
                  Now Playing
                </div>
                <div className="text-sm font-semibold mt-1">
                  ZRP Music
                </div>
              </div>

              <button
                type="button"
                className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"
                aria-label="Queue"
              >
                <ListMusic className="w-5 h-5" />
              </button>
            </div>

            {/* Artwork */}
            <div className="flex-1 flex flex-col justify-center px-6 py-6">
              <div className="relative mx-auto w-full max-w-[430px] aspect-square">
                <div className="absolute inset-4 rounded-[32px] bg-zrp-red/20 blur-3xl" />

                <img
                  src={cover}
                  alt=""
                  className={`relative w-full h-full object-cover rounded-[28px] shadow-2xl ${
                    playing ? "scale-[1]" : "scale-[0.97]"
                  } transition-transform duration-700`}
                />
              </div>

              {/* Track information */}
              <div className="max-w-[500px] w-full mx-auto mt-8">
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-2xl sm:text-3xl font-bold truncate">
                      {current.title}
                    </h1>

                    <p className="text-white/60 mt-1 truncate">
                      {current.artist.displayName}
                      {current.album?.title
                        ? ` • ${current.album.title}`
                        : ""}
                    </p>

                    {error && (
                      <p role="alert" className="text-red-400 text-sm mt-2">
                        {error}
                      </p>
                    )}

                    {current.genre && (
                      <span className="inline-flex mt-3 px-3 py-1 rounded-full bg-white/10 text-xs text-white/60">
                        {current.genre}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-8">
                  <input
                    aria-label="Seek"
                    type="range"
                    min={0}
                    max={duration || 1}
                    step="0.1"
                    value={Math.min(progress, duration || 1)}
                    onChange={(event) =>
                      seek(Number(event.target.value))
                    }
                    className="w-full accent-zrp-red"
                  />

                  <div className="flex justify-between text-xs text-white/40 mt-2">
                    <span>{formatTime(progress)}</span>
                    <span>-{formatTime(remaining)}</span>
                  </div>
                </div>

                {/* Main controls */}
                <div className="flex items-center justify-between mt-7">
                  <button
                    type="button"
                    onClick={toggleShuffle}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
                      shuffle
                        ? "text-zrp-red bg-zrp-red/10"
                        : "text-white/60"
                    }`}
                    aria-label="Shuffle"
                  >
                    <Shuffle className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={previous}
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    aria-label="Previous"
                  >
                    <SkipBack className="w-7 h-7 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      playing ? pause() : play()
                    }
                    className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-zrp-red flex items-center justify-center shadow-[0_0_45px_rgba(220,38,38,0.35)] active:scale-95 transition"
                    aria-label={playing ? "Pause" : "Play"}
                    aria-busy={buffering}
                  >
                    {buffering && playing && (
                      <span className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    )}
                    {playing ? (
                      <Pause className="w-8 h-8 fill-white" />
                    ) : (
                      <Play className="w-8 h-8 fill-white ml-1" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={next}
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    aria-label="Next"
                  >
                    <SkipForward className="w-7 h-7 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={cycleRepeat}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
                      repeat !== "off"
                        ? "text-zrp-red bg-zrp-red/10"
                        : "text-white/60"
                    }`}
                    aria-label="Repeat"
                  >
                    {repeat === "one" ? (
                      <Repeat1 className="w-5 h-5" />
                    ) : (
                      <Repeat className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Volume */}
                <div className="flex items-center gap-3 mt-8">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="text-white/60"
                    aria-label={muted ? "Unmute" : "Mute"}
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>

                  <input
                    aria-label="Volume"
                    type="range"
                    min={0}
                    max={1}
                    step="0.01"
                    value={muted ? 0 : volume}
                    onChange={(event) =>
                      setVolume(Number(event.target.value))
                    }
                    className="flex-1 accent-zrp-red"
                  />

                  <span className="text-xs text-white/40 w-8 text-right">
                    {Math.round((muted ? 0 : volume) * 100)}
                  </span>
                </div>

                {/* Queue preview */}
                {queue.length > 0 && (
                  <div className="mt-8 rounded-2xl bg-white/5 border border-white/10 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">
                          Up Next
                        </div>
                        <div className="text-xs text-white/40 mt-1">
                          {queue.length} track
                          {queue.length === 1 ? "" : "s"} in queue
                        </div>
                      </div>

                      <ListMusic className="w-5 h-5 text-white/40" />
                    </div>

                    <div className="mt-3 space-y-2">
                      {queue.slice(0, 3).map((track) => (
                        <div
                          key={track.id}
                          className="flex items-center gap-3 py-2"
                        >
                          <img
                            src={
                              track.coverUrl ||
                              track.album?.coverUrl ||
                              "/logo.png"
                            }
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover"
                          />

                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {track.title}
                            </div>
                            <div className="text-xs text-white/40 truncate">
                              {track.artist.displayName}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="h-[env(safe-area-inset-bottom)]" />
          </div>
        </div>
      )}

      {/* Mini Player */}
      {!expanded && (
        <div className="fixed bottom-[64px] lg:bottom-0 left-0 right-0 lg:left-64 z-[9998]">
          <div className="mx-auto max-w-[1200px] px-2 sm:px-3">
            <div className="relative overflow-hidden rounded-2xl lg:rounded-none border border-white/10 bg-zrp-deepBlack/95 backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.25)]">
              {/* Progress line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/10">
                <div
                  className="h-full bg-zrp-red transition-[width] duration-200"
                  style={{
                    width: `${
                      duration
                        ? Math.min(
                            100,
                            (progress / duration) * 100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>

              <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2">
                {/* Artwork */}
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="shrink-0"
                  aria-label="Open now playing"
                >
                  <img
                    src={cover}
                    alt=""
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover"
                  />
                </button>

                {/* Info */}
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="font-semibold text-sm truncate text-white">
                    {current.title}
                  </div>

                  <div className="text-xs text-white/50 truncate">
                    {error || (buffering ? "Buffering..." : current.artist.displayName)}
                  </div>
                </button>

                {/* Desktop shuffle */}
                <button
                  type="button"
                  onClick={toggleShuffle}
                  className={`hidden md:flex w-9 h-9 items-center justify-center ${
                    shuffle
                      ? "text-zrp-red"
                      : "text-white/50"
                  }`}
                  aria-label="Shuffle"
                >
                  <Shuffle className="w-4 h-4" />
                </button>

                {/* Previous */}
                <button
                  type="button"
                  onClick={previous}
                  className="hidden sm:flex w-9 h-9 items-center justify-center text-white/70"
                  aria-label="Previous"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>

                {/* Play */}
                <button
                  type="button"
                  onClick={() =>
                    playing ? pause() : play()
                  }
                  className="relative shrink-0 w-11 h-11 rounded-full bg-zrp-red text-white flex items-center justify-center active:scale-95 transition"
                  aria-label={playing ? "Pause" : "Play"}
                  aria-busy={buffering}
                >
                  {buffering && playing && (
                    <span className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  )}
                  {playing ? (
                    <Pause className="w-5 h-5 fill-white" />
                  ) : (
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  )}
                </button>

                {/* Next */}
                <button
                  type="button"
                  onClick={next}
                  className="hidden sm:flex w-9 h-9 items-center justify-center text-white/70"
                  aria-label="Next"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>

                {/* Volume desktop */}
                <button
                  type="button"
                  onClick={toggleMute}
                  className="hidden lg:flex text-white/50"
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>

                <input
                  aria-label="Volume"
                  type="range"
                  min={0}
                  max={1}
                  step="0.01"
                  value={muted ? 0 : volume}
                  onChange={(event) =>
                    setVolume(Number(event.target.value))
                  }
                  className="hidden lg:block w-20 accent-zrp-red"
                />

                {/* Expand */}
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="shrink-0 w-9 h-9 flex items-center justify-center text-white/50"
                  aria-label="Expand player"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile seek */}
              <div className="px-3 pb-2 sm:hidden">
                <input
                  aria-label="Seek"
                  type="range"
                  min={0}
                  max={duration || 1}
                  step="0.1"
                  value={Math.min(progress, duration || 1)}
                  onChange={(event) =>
                    seek(Number(event.target.value))
                  }
                  className="w-full h-1 accent-zrp-red"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
