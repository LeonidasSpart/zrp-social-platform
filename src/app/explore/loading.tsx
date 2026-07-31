// src/app/explore/loading.tsx
import { SkeletonFeed } from "@/components/skeletons/SkeletonFeed";

export default function ExploreLoading() {
  return (
    <div className="max-w-2xl mx-auto">
      <Skeleton variant="rect" className="h-12 w-full mb-4" /> {/* search bar */}
      <SkeletonFeed count={6} />
    </div>
  );
}
