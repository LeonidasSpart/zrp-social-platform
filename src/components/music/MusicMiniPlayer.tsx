"use client";

import { Pause, Play, SkipBack, SkipForward, Volume2, X } from "lucide-react";
import { useMusicPlayer } from "./MusicPlayerProvider";

export default function MusicMiniPlayer() {
  const { current, playing, progress, duration, volume, play, pause, next, previous, seek, setVolume } = useMusicPlayer();
  if (!current) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-[9998] border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur-xl shadow-2xl">
      <div className="mx-auto max-w-[1100px] px-3 py-2">
        <div className="flex items-center gap-3">
          <img src={current.coverUrl || current.album?.coverUrl || "/logo.png"} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100 dark:bg-gray-800" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate">{current.title}</div>
            <div className="text-xs text-gray-500 truncate">{current.artist.displayName}</div>
            <input aria-label="Seek" type="range" min={0} max={duration || 1} step="0.1" value={Math.min(progress, duration || 1)} onChange={e => seek(Number(e.target.value))} className="w-full accent-zrp-red" />
          </div>
          <button onClick={previous} aria-label="Previous"><SkipBack className="w-5 h-5"/></button>
          <button onClick={() => playing ? pause() : play()} aria-label={playing ? "Pause" : "Play"} className="w-10 h-10 rounded-full bg-zrp-red text-white flex items-center justify-center">
            {playing ? <Pause className="w-5 h-5"/> : <Play className="w-5 h-5 ml-0.5"/>}
          </button>
          <button onClick={next} aria-label="Next"><SkipForward className="w-5 h-5"/></button>
          <Volume2 className="hidden sm:block w-5 h-5" />
          <input className="hidden sm:block w-20 accent-zrp-red" aria-label="Volume" type="range" min={0} max={1} step="0.01" value={volume} onChange={e => setVolume(Number(e.target.value))}/>
        </div>
      </div>
    </div>
  );
}
