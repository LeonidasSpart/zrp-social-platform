"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

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
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
};

const MusicContext = createContext<MusicContextType | null>(null);

export function MusicPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [current, setCurrent] = useState<MusicTrack | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [history, setHistory] = useState<MusicTrack[]>([]);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");

  const lastReported = useRef(0);
  const currentRef = useRef<MusicTrack | null>(null);
  const repeatRef = useRef<RepeatMode>("off");
  const shuffleRef = useRef(false);

  useEffect(() => {
    currentRef.current = current;
    repeatRef.current = repeat;
    shuffleRef.current = shuffle;
  }, [current, repeat, shuffle]);

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
