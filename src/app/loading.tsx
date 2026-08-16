import { Skeleton } from "@/components/ui/Skeleton";
import { SkeletonFeed } from "@/components/skeletons/SkeletonFeed";

// Along with the other 5 missing loading.tsx files added alongside this
// one, and the AnimatePresence mode fix in PageTransition.tsx - together
// these address "the platform feels slow moving between sections":
// without this, Next.js shows nothing at all during navigation until the
// whole page and every one of its client-side fetches are ready, so
// navigation felt like it froze rather than responded immediately.
export default function HomeLoading() {
  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <Skeleton variant="rect" className="h-24 w-full mb-4 rounded-2xl" /> {/* composer */}
      <SkeletonFeed count={6} />
    </div>
  );
}
