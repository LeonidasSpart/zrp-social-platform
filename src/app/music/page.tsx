import { Suspense } from "react";
import MusicShell from "@/components/music/MusicShell";

export const metadata = {
  title: "ZRP Music",
  description: "Music inside ZRP Social.",
};

export default function MusicPage() {
  return (
    <Suspense fallback={null}>
      <MusicShell />
    </Suspense>
  );
}
