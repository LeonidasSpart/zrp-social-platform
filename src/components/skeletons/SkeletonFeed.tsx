// src/components/skeletons/SkeletonFeed.tsx
import { SkeletonFeedItem } from "./SkeletonFeedItem";

export function SkeletonFeed({ count = 5 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonFeedItem key={i} />
      ))}
    </div>
  );
}
