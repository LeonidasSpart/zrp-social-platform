"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export type RepeatMode = "off" | "all" | "one";

export type MusicTrack = {
  id: string;
  title: string;
  audioUrl: string;
  coverUrl?: string | null;
  durationSec?: number | null;
  artist: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  album?: {
    id: string;
    title: string;
    coverUrl?: string | null;
  } | null;
  genre?: string | null;
  playCount?: number;
  liked?: boolean;
};

type MusicContextType = {
  current: MusicTrack | null;
  queue: MusicTrack[];
  playing: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  buffering: boolean;
  error: string | null;

  // Whether the persistent player bar is closed. Closing pauses playback
  // and hides the bar, but keeps `current`, the queue, history and the
  // playback position exactly as they were, so it is fully reversible:
  // `resume()` (the "Continue listening" strip on the Music page) or any
  // deliberate `play()` brings the bar back and carries on from where
  // it stopped. Previously the X hid the bar while the audio kept
  // playing, with no in-app control left to pause it or bring it back.
  dismissed: boolean;
  dismiss: () => void;
  resume: () => void;

  play: (track?: MusicTrack) => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;

  setVolume: (volume: number) => void;
  toggleMute: () => void;

  toggleShuffle: () => void;
  cycleRepeat: () => void;

  addToQueue: (track: MusicTrack) => void;
  playNext: (track: MusicTrack) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
};

const MusicContext = createContext<MusicContextType | null>(null);

export function MusicPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [current, setCurrent] = useState<MusicTrack | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [history, setHistory] = useState<MusicTrack[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastReported = useRef(0);
  const currentRef = useRef<MusicTrack | null>(null);
  const repeatRef = useRef<RepeatMode>("off");
  const shuffleRef = useRef(false);
  const tRef = useRef(t);

  useEffect(() => {
    currentRef.current = current;
    repeatRef.current = repeat;
    shuffleRef.current = shuffle;
    tRef.current = t;
  }, [current, repeat, shuffle, t]);

  /*
   * Create one persistent audio element.
   * This allows playback to continue while navigating around ZRP.
   */
  useEffect(() => {
    const audio = new Audio();

    audio.preload = "metadata";
    audio.volume = 1;
    audio.muted = false;

    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      const nextDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : current?.durationSec || 0;

      setDuration(nextDuration);
    };

    const handlePlay = () => {
      setPlaying(true);
    };

    const handlePause = () => {
      setPlaying(false);
    };

    const handleWaiting = () => {
      setBuffering(true);
    };

    const handleCanPlay = () => {
      setBuffering(false);
    };

    // A broken/unreachable audio file shouldn't strand playback - skip
    // to the next queued track the same way a natural "ended" event
    // does, just without reporting a completed play for a track that
    // never actually played.
    const handleError = () => {
      setBuffering(false);
      setPlaying(false);
      setError(tRef.current("music.player.playbackError"));

      const activeShuffle = shuffleRef.current;

      setQueue((previousQueue) => {
        if (!previousQueue.length) {
          setCurrent(null);
          return previousQueue;
        }

        let nextIndex = 0;
        if (activeShuffle && previousQueue.length > 1) {
          nextIndex = Math.floor(Math.random() * previousQueue.length);
        }

        const nextTrack = previousQueue[nextIndex];
        const remaining = previousQueue.filter((_, index) => index !== nextIndex);

        setCurrent(nextTrack);
        setPlaying(true);

        return remaining;
      });
    };

    const handleEnded = () => {
      const activeTrack = currentRef.current;
      const activeRepeat = repeatRef.current;
      const activeShuffle = shuffleRef.current;

      if (activeTrack) {
        fetch("/api/music/tracks/play", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            trackId: activeTrack.id,
            secondsPlayed: Math.round(audio.currentTime),
            completed: true,
            durationSec: Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : undefined,
          }),
        }).catch(() => {});
      }

      if (activeRepeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => setPlaying(false));
        return;
      }

      setHistory((previous) =>
        activeTrack
          ? [...previous, activeTrack].slice(-50)
          : previous
      );

      setQueue((previousQueue) => {
        if (!previousQueue.length) {
          if (activeRepeat === "all" && activeTrack) {
            audio.currentTime = 0;
            audio.play().catch(() => setPlaying(false));
            return previousQueue;
          }

          setPlaying(false);
          return previousQueue;
        }

        let nextIndex = 0;

        if (activeShuffle && previousQueue.length > 1) {
          nextIndex = Math.floor(
            Math.random() * previousQueue.length
          );
        }

        const nextTrack = previousQueue[nextIndex];

        const remaining = previousQueue.filter(
          (_, index) => index !== nextIndex
        );

        setCurrent(nextTrack);
        setPlaying(true);

        return remaining;
      });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("playing", handleCanPlay);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();

      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("playing", handleCanPlay);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  /*
   * Load the selected track.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio || !current) return;

    audio.src = current.audioUrl;
    audio.load();

    setProgress(0);
    setDuration(current.durationSec || 0);
    setError(null);

    lastReported.current = 0;

    if (playing) {
      audio.play().catch(() => {
        setPlaying(false);
      });
    }
  }, [current]);

  /*
   * Play / pause state.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    if (playing) {
      audio.play().catch(() => {
        setPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [playing]);

  /*
   * Volume.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    audio.volume = volume;
    audio.muted = muted;
  }, [volume, muted]);

  /*
   * Media Session API.
   * Gives supported browsers/devices information for
   * lock-screen and hardware media controls.
   */
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      !current
    ) {
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist.displayName,
        album: current.album?.title || "ZRP Music",
        artwork: current.coverUrl
          ? [
              {
                src: current.coverUrl,
                sizes: "512x512",
                type: "image/jpeg",
              },
            ]
          : [],
      });

      navigator.mediaSession.playbackState = playing
        ? "playing"
        : "paused";

      navigator.mediaSession.setActionHandler("play", () => {
        setPlaying(true);
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        setPlaying(false);
      });

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        previous();
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        next();
      });

      navigator.mediaSession.setActionHandler("seekbackward", () => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.currentTime = Math.max(
          0,
          audio.currentTime - 10
        );
      });

      navigator.mediaSession.setActionHandler("seekforward", () => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.currentTime = Math.min(
          audio.duration || Infinity,
          audio.currentTime + 10
        );
      });
    } catch {
      // Media Session is optional.
    }
  }, [current, playing]);

  const play = useCallback(
    (track?: MusicTrack) => {
      // A deliberate "play this" action always brings the bar back,
      // even if it was previously dismissed - the user just asked to
      // listen to something, so hiding that from them would look broken.
      setDismissed(false);

      if (track && track.id !== current?.id) {
        if (current) {
          setHistory((previous) =>
            [...previous, current].slice(-50)
          );
        }

        setCurrent(track);
        setPlaying(true);
        return;
      }

      setPlaying(true);
    },
    [current]
  );

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

  // Closes the persistent player bar: pauses playback and hides the bar.
  // Nothing is cleared - `current`, the queue, history and the audio
  // element's position all survive - so `resume()` picks up exactly where
  // this left off. A close that kept the audio playing behind an
  // invisible bar (the old behaviour) left the listener with no in-app
  // way to pause it; a close that threw the queue away would not be
  // reversible. This is neither.
  const dismiss = useCallback(() => {
    setPlaying(false);
    setDismissed(true);
  }, []);

  // Brings a closed player back and continues the same track from the
  // position it was paused at.
  const resume = useCallback(() => {
    if (!currentRef.current) return;
    setDismissed(false);
    setPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    setPlaying((value) => !value);
  }, []);

  const next = useCallback(() => {
    setQueue((previousQueue) => {
      if (!previousQueue.length) {
        setPlaying(false);
        return previousQueue;
      }

      let index = 0;

      if (shuffle && previousQueue.length > 1) {
        index = Math.floor(
          Math.random() * previousQueue.length
        );
      }

      const nextTrack = previousQueue[index];

      if (current) {
        setHistory((previous) =>
          [...previous, current].slice(-50)
        );
      }

      setCurrent(nextTrack);
      setPlaying(true);

      return previousQueue.filter(
        (_, queueIndex) => queueIndex !== index
      );
    });
  }, [current, shuffle]);

  const previous = useCallback(() => {
    const audio = audioRef.current;

    if (!audio) return;

    /*
     * Spotify-style behavior:
     * If we're more than 5 seconds into the song,
     * go back to the beginning.
     */
    if (audio.currentTime > 5) {
      audio.currentTime = 0;
      setProgress(0);
      return;
    }

    setHistory((previousHistory) => {
      if (!previousHistory.length) {
        audio.currentTime = 0;
        return previousHistory;
      }

      const previousTrack =
        previousHistory[previousHistory.length - 1];

      setCurrent(previousTrack);
      setPlaying(true);

      return previousHistory.slice(0, -1);
    });
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;

    if (!audio) return;

    const safeSeconds = Math.max(
      0,
      Math.min(
        seconds,
        Number.isFinite(audio.duration)
          ? audio.duration
          : seconds
      )
    );

    audio.currentTime = safeSeconds;
    setProgress(safeSeconds);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const safeVolume = Math.max(
      0,
      Math.min(1, nextVolume)
    );

    setVolumeState(safeVolume);

    if (safeVolume > 0) {
      setMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((value) => !value);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((value) => !value);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((value) => {
      if (value === "off") return "all";
      if (value === "all") return "one";
      return "off";
    });
  }, []);

  const addToQueue = useCallback((track: MusicTrack) => {
    setQueue((previous) => [...previous, track]);
  }, []);

  const playNext = useCallback((track: MusicTrack) => {
    setQueue((previous) => [track, ...previous.filter((t) => t.id !== track.id)]);
  }, []);

  const removeFromQueue = useCallback((trackId: string) => {
    setQueue((previous) =>
      previous.filter((track) => track.id !== trackId)
    );
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  /*
   * Periodically report listening progress.
   */
  useEffect(() => {
    if (
      !current ||
      progress < 15 ||
      progress - lastReported.current < 15
    ) {
      return;
    }

    lastReported.current = progress;

    fetch("/api/music/tracks/play", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trackId: current.id,
        secondsPlayed: Math.round(progress),
        completed: false,
        durationSec: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
      }),
    }).catch(() => {});
  }, [progress, current]);

  return (
    <MusicContext.Provider
      value={{
        current,
        queue,
        playing,
        progress,
        duration,
        volume,
        muted,
        shuffle,
        repeat,
        buffering,
        error,

        dismissed,
        dismiss,
        resume,

        play,
        pause,
        togglePlay,
        next,
        previous,
        seek,

        setVolume,
        toggleMute,

        toggleShuffle,
        cycleRepeat,

        addToQueue,
        playNext,
        removeFromQueue,
        clearQueue,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
}

export function useMusicPlayer() {
  const value = useContext(MusicContext);

  if (!value) {
    throw new Error(
      "useMusicPlayer must be used inside MusicPlayerProvider"
    );
  }

  return value;
}
