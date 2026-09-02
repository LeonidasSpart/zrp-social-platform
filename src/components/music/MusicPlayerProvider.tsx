"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

export type MusicTrack = {
  id: string;
  title: string;
  audioUrl: string;
  coverUrl?: string | null;
  durationSec?: number | null;
  artist: { id: string; displayName: string; avatarUrl?: string | null };
  album?: { id: string; title: string; coverUrl?: string | null } | null;
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
  play: (track?: MusicTrack) => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  addToQueue: (track: MusicTrack) => void;
};

const MusicContext = createContext<MusicContextType | null>(null);

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<MusicTrack | null>(null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const lastReported = useRef(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = volume;
    audioRef.current = audio;
    const time = () => setProgress(audio.currentTime);
    const meta = () => setDuration(audio.duration || current?.durationSec || 0);
    const ended = () => {
      if (current) {
        fetch("/api/music/tracks/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackId: current.id, secondsPlayed: Math.round(audio.currentTime), completed: true }),
        }).catch(() => {});
      }
      setPlaying(false);
      setQueue(q => {
        if (!q.length) return q;
        const [next, ...rest] = q;
        setCurrent(next);
        return rest;
      });
    };
    audio.addEventListener("timeupdate", time);
    audio.addEventListener("loadedmetadata", meta);
    audio.addEventListener("ended", ended);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", time);
      audio.removeEventListener("loadedmetadata", meta);
      audio.removeEventListener("ended", ended);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.src = current.audioUrl;
    audio.load();
    lastReported.current = 0;
    if (playing) audio.play().catch(() => setPlaying(false));
  }, [current]);

  useEffect(() => {
    if (playing) audioRef.current?.play().catch(() => setPlaying(false));
    else audioRef.current?.pause();
  }, [playing]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const play = (track?: MusicTrack) => {
    if (track && track.id !== current?.id) {
      setCurrent(track);
      setPlaying(true);
      return;
    }
    setPlaying(true);
  };

  const pause = () => setPlaying(false);

  const next = () => {
    setQueue(q => {
      if (!q.length) { setPlaying(false); return q; }
      const [n, ...rest] = q;
      setCurrent(n);
      setPlaying(true);
      return rest;
    });
  };

  const previous = () => {
    const a = audioRef.current;
    if (a && a.currentTime > 5) { a.currentTime = 0; return; }
  };

  const seek = (seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
    setProgress(seconds);
  };

  const setVolume = (v: number) => setVolumeState(Math.max(0, Math.min(1, v)));

  const addToQueue = (track: MusicTrack) => setQueue(q => [...q, track]);

  useEffect(() => {
    if (!current || progress < 15 || progress - lastReported.current < 15) return;
    lastReported.current = progress;
    fetch("/api/music/tracks/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: current.id, secondsPlayed: Math.round(progress), completed: false }),
    }).catch(() => {});
  }, [progress, current]);

  return (
    <MusicContext.Provider value={{ current, queue, playing, progress, duration, volume, play, pause, next, previous, seek, setVolume, addToQueue }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusicPlayer() {
  const value = useContext(MusicContext);
  if (!value) throw new Error("useMusicPlayer must be used inside MusicPlayerProvider");
  return value;
}
