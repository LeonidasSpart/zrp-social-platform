import { SkeletonFeed } from "@/components/skeletons/SkeletonFeed";

export default function BookmarksLoading() {
  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <SkeletonFeed count={6} />
    </div>
  );
}
