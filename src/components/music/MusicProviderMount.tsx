"use client";
import { MusicPlayerProvider } from "./MusicPlayerProvider";
import MusicMiniPlayer from "./MusicMiniPlayer";

export default function MusicProviderMount({ children }: { children: React.ReactNode }) {
  return (
    <MusicPlayerProvider>
      {children}
      <MusicMiniPlayer />
    </MusicPlayerProvider>
  );
}
