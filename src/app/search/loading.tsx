import { Skeleton } from "@/components/ui/Skeleton";
import { SkeletonFeed } from "@/components/skeletons/SkeletonFeed";

export default function SearchLoading() {
  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <Skeleton variant="rect" className="h-12 w-full mb-4" /> {/* search bar */}
      <SkeletonFeed count={6} />
    </div>
  );
}
