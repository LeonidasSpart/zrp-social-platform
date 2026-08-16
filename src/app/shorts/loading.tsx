import { Loader2 } from "lucide-react";

// Matches ShortsPage's own internal loading state exactly (same classes),
// so there's no visible flash/mismatch the instant the component itself
// mounts and takes over rendering its own loading state.
export default function ShortsLoading() {
  return (
    <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white animate-spin" />
    </div>
  );
}
