import { Suspense } from "react";
import { SkeletonFeed } from "@/components/skeletons/SkeletonFeed";
import { FeedContent } from "./FeedContent";

export function Feed() {
  return (
    <Suspense fallback={<SkeletonFeed count={5} />}>
      <FeedContent />
    </Suspense>
  );
}
