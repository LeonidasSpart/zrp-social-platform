import { Suspense } from "react";
import MusicShell from "@/components/music/MusicShell";

// /music is not in middleware.ts's PUBLIC_PATHS - visiting it while
// logged out redirects to /login - so unlike the public marketing pages
// this file used to be grouped with in the audit, it isn't actually
// shareable content and shouldn't carry a social-preview image. It was
// previously missing the noindex every other authenticated-only route
// in src/app sets (see e.g. bookmarks/layout.tsx), which left it
// indexable by search engines despite requiring a login it would then
// redirect a crawler-following visitor away from.
export const metadata = {
  title: "ZRP Music",
  description: "Music inside ZRP Social.",
  robots: { index: false, follow: false },
};

export default function MusicPage() {
  return (
    <Suspense fallback={null}>
      <MusicShell />
    </Suspense>
  );
}
