import { Skeleton } from "@/components/ui/Skeleton";

// Notification rows are simpler than a full feed post (avatar + one
// line of text, no body/actions), so a lighter custom row fits better
// than reusing the heavier SkeletonFeedItem built for posts.
function SkeletonNotificationRow() {
  return (
    <div className="flex items-center gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800">
      <Skeleton variant="avatar" className="w-10 h-10 flex-shrink-0" />
      <Skeleton variant="text" className="flex-1 h-4" />
    </div>
  );
}

export default function NotificationsLoading() {
  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonNotificationRow key={i} />
      ))}
    </div>
  );
}
