import Link from "next/link";
import { PostActions } from "@/components/Post/PostActions";
import { Avatar } from "@/components/ui/avatar";
import VerifiedBadge from "@/components/VerifiedBadge";
import { timeAgo } from "@/lib/utils";

interface FeedItemProps {
  post: {
    id: string;
    content: string;
    imageUrl?: string | null;
    createdAt: Date;
    author: {
      id: string;
      username: string;
      name: string | null;
      avatar?: string | null;
      image?: string | null;
      profilePicture?: string | null;
      avatarUrl?: string | null;
      badgeType: string | null;
    };
    likes: { id: string }[];
    reposts: { id: string }[];
    bookmarks: { id: string }[];
    _count: {
      likes: number;
      comments: number;
      reposts: number;
    };
  };
  userId: string;
}

// ─── PARSE HASHTAGS AND MENTIONS ──────────────────────────────────
function parseContent(content: string) {
  const parts: { type: "text" | "hashtag" | "mention"; value: string }[] = [];
  let lastIndex = 0;
  const regex = /(@\w+)|(#\w+)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        value: content.slice(lastIndex, match.index),
      });
    }
    parts.push({
      type: match[0].startsWith("@") ? "mention" : "hashtag",
      value: match[0],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: "text",
      value: content.slice(lastIndex),
    });
  }

  return parts;
}

export function FeedItem({ post, userId }: FeedItemProps) {
  const isLiked = post.likes.length > 0;
  const isReposted = post.reposts.length > 0;
  const isBookmarked = post.bookmarks.length > 0;

  const avatarSrc =
    post.author.avatar ??
    post.author.image ??
    post.author.profilePicture ??
    post.author.avatarUrl ??
    "/default-avatar.png";

  const contentParts = parseContent(post.content);

  return (
    <article className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
      <div className="flex gap-3">
        <Link href={`/profile/${post.author.username}`} className="flex-shrink-0">
          <Avatar src={avatarSrc} alt={post.author.name || post.author.username} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/profile/${post.author.username}`}
              className="font-semibold hover:underline"
            >
              {post.author.name || post.author.username}
            </Link>
            <VerifiedBadge badgeType={post.author.badgeType} />
            <span className="text-sm text-zinc-500">@{post.author.username}</span>
            <span className="text-sm text-zinc-400">·</span>
            <time className="text-sm text-zinc-400" dateTime={post.createdAt.toISOString()}>
              {timeAgo(post.createdAt)}
            </time>
          </div>

          {/* ─── CONTENT WITH CLICKABLE HASHTAGS & MENTIONS ─── */}
          <div className="mt-1 whitespace-pre-wrap break-words">
            {contentParts.map((part, index) => {
              if (part.type === "hashtag") {
                const tag = part.value.slice(1);
                return (
                  <Link
                    key={index}
                    href={`/hashtag/${tag}`}
                    className="text-zrp-red hover:underline"
                  >
                    {part.value}
                  </Link>
                );
              }
              if (part.type === "mention") {
                const username = part.value.slice(1);
                return (
                  <Link
                    key={index}
                    href={`/profile/${username}`}
                    className="text-zrp-red hover:underline"
                  >
                    {part.value}
                  </Link>
                );
              }
              return <span key={index}>{part.value}</span>;
            })}
          </div>

          {post.imageUrl && (
            <div className="mt-2 rounded-lg overflow-hidden">
              <img
                src={post.imageUrl}
                alt="Post image"
                className="w-full max-h-96 object-cover"
                loading="lazy"
              />
            </div>
          )}
          <PostActions
            postId={post.id}
            userId={userId}
            initialLikes={post._count.likes}
            initialComments={post._count.comments}
            initialReposts={post._count.reposts}
            isLiked={isLiked}
            isReposted={isReposted}
            isBookmarked={isBookmarked}
          />
        </div>
      </div>
    </article>
  );
}
