 import { Skeleton } from "@/components/ui/Skeleton";

export function SkeletonFeedItem() {
  return (
    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <Skeleton variant="avatar" className="w-10 h-10" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton variant="text" className="w-24 h-4" />
            <Skeleton variant="text" className="w-16 h-3" />
          </div>
          <Skeleton variant="text" className="w-full h-4" />
          <Skeleton variant="text" className="w-3/4 h-4" />
          <div className="flex gap-4 mt-3">
            <Skeleton variant="text" className="w-12 h-5" />
            <Skeleton variant="text" className="w-12 h-5" />
            <Skeleton variant="text" className="w-12 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
