// src/components/skeletons/SkeletonMessage.tsx
import { Skeleton } from "@/components/ui/Skeleton";

export function SkeletonMessage({ self = false }: { self?: boolean }) {
  return (
    <div className={`flex ${self ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`flex items-start gap-2 max-w-[70%] ${self ? "flex-row-reverse" : ""}`}>
        {!self && <Skeleton variant="avatar" className="w-8 h-8" />}
        <Skeleton variant="rect" className={`h-10 rounded-2xl ${self ? "w-48" : "w-32"}`} />
      </div>
    </div>
  );
}
