"use client";

import Link from "next/link";
import { ArrowLeft, ListMusic, Trash2, Pause, Play } from "lucide-react";
import { useMusicPlayer } from "@/components/music/MusicPlayerProvider";

export default function MusicQueuePage() {
  const { current, queue, playing, play, pause, removeFromQueue, clearQueue } = useMusicPlayer();

  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] text-gray-950 dark:text-white pb-32">
      <header className="sticky top-0 z-30 border-b border-gray-200/70 dark:border-white/10 bg-white/85 dark:bg-[#050505]/85 backdrop-blur-2xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/music" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Back to Music">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="font-black text-lg">Your Queue</div>

          {queue.length > 0 && (
            <button
              type="button"
              onClick={clearQueue}
              className="ml-auto text-sm text-gray-500 hover:text-zrp-red flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> Clear queue
            </button>
          )}
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {current && (
          <section>
            <div className="text-xs uppercase tracking-[0.2em] text-zrp-red font-bold mb-3">Now playing</div>
            <div className="flex items-center gap-3 p-3 rounded-2xl border border-zrp-red/30 bg-zrp-red/5">
              <img
                src={current.coverUrl || current.album?.coverUrl || "/logo.png"}
                alt=""
                className="w-14 h-14 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{current.title}</div>
                <div className="text-sm text-gray-500 truncate">{current.artist.displayName}</div>
              </div>
              <button
                type="button"
                onClick={() => (playing ? pause() : play())}
                className="w-11 h-11 rounded-full bg-zrp-red text-white flex items-center justify-center shrink-0"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
              </button>
            </div>
          </section>
        )}

        <section>
          <div className="text-xs uppercase tracking-[0.2em] text-zrp-red font-bold mb-3">
            Up next ({queue.length})
          </div>

          {!queue.length ? (
            <div className="rounded-[24px] border border-dashed border-gray-300 dark:border-white/10 py-16 text-center">
              <ListMusic className="w-10 h-10 mx-auto text-gray-300 dark:text-white/20" />
              <div className="font-bold mt-4">Your queue is empty</div>
              <div className="text-sm text-gray-500 mt-2">
                Add tracks to your queue from Discover, an artist, or an album.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-white/5 rounded-2xl border border-gray-200 dark:border-white/10 overflow-hidden bg-white dark:bg-white/[0.02]">
              {queue.map((track, index) => (
                <div key={`${track.id}-${index}`} className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
                  <div className="w-6 text-center text-xs text-gray-400 shrink-0">{index + 1}</div>
                  <img
                    src={track.coverUrl || track.album?.coverUrl || "/logo.png"}
                    alt=""
                    className="w-11 h-11 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{track.title}</div>
                    <div className="text-xs text-gray-500 truncate">{track.artist.displayName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => play(track)}
                    className="w-8 h-8 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 flex items-center justify-center"
                    aria-label={`Play ${track.title} now`}
                  >
                    <Play className="w-4 h-4 text-gray-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFromQueue(track.id)}
                    className="w-8 h-8 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
                    aria-label={`Remove ${track.title} from queue`}
                  >
                    <Trash2 className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
