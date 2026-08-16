import { Skeleton } from "@/components/ui/Skeleton";

// A conversation-list row (avatar + name + last-message preview), not
// SkeletonMessage (that's chat bubbles for inside an open conversation -
// a different shape entirely from this list view).
function SkeletonConversationRow() {
  return (
    <div className="flex items-center gap-3 p-3 border-b border-zinc-200 dark:border-zinc-800">
      <Skeleton variant="avatar" className="w-12 h-12 flex-shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <Skeleton variant="text" className="w-32 h-4" />
        <Skeleton variant="text" className="w-48 h-3" />
      </div>
    </div>
  );
}

export default function MessagesLoading() {
  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonConversationRow key={i} />
      ))}
    </div>
  );
}
