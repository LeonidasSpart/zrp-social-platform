 // src/components/skeletons/SkeletonProfileHeader.tsx
import { Skeleton } from "@/components/ui/Skeleton";

export function SkeletonProfileHeader() {
  return (
    <div className="p-4 flex flex-col items-center space-y-4">
      <Skeleton variant="avatar" className="w-24 h-24" />
      <Skeleton variant="text" className="w-32 h-6" />
      <Skeleton variant="text" className="w-48 h-4" />
      <div className="flex gap-6">
        <Skeleton variant="text" className="w-16 h-5" />
        <Skeleton variant="text" className="w-16 h-5" />
        <Skeleton variant="text" className="w-16 h-5" />
      </div>
    </div>
  );
}
