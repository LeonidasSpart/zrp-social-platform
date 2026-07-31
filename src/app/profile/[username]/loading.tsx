// src/app/profile/[username]/loading.tsx
import { SkeletonProfileHeader } from "@/components/skeletons/SkeletonProfileHeader";
import { SkeletonFeed } from "@/components/skeletons/SkeletonFeed";

export default function ProfileLoading() {
  return (
    <div className="max-w-2xl mx-auto">
      <SkeletonProfileHeader />
      <SkeletonFeed count={4} />
    </div>
  );
}
