// src/components/skeletons/SkeletonComment.tsx
import { Skeleton } from "@/components/ui/Skeleton";

export function SkeletonComment() {
  return (
    <div className="flex gap-3 p-3 border-b border-zinc-100 dark:border-zinc-800">
      <Skeleton variant="avatar" className="w-8 h-8" />
      <div className="flex-1 space-y-1">
        <Skeleton variant="text" className="w-20 h-3" />
        <Skeleton variant="text" className="w-full h-3" />
        <Skeleton variant="text" className="w-3/4 h-3" />
      </div>
    </div>
  );
}
