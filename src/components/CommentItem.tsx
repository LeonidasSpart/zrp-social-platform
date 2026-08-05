"use client";

import Link from "next/link";

interface Comment {
  id: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
  };
  parentId?: string;
}

export default function CommentItem({ comment }: { comment: Comment }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
      <div className="flex items-start gap-3">
        <Link href={`/profile/${comment.author.username}`} className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            {comment.author.avatarUrl ? (
              <img
                src={comment.author.avatarUrl}
                alt={comment.author.name || comment.author.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-sm">
                {(comment.author.name || comment.author.username)[0].toUpperCase()}
              </div>
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/profile/${comment.author.username}`}
              className="font-semibold hover:underline text-gray-900 dark:text-white text-sm"
            >
              {comment.author.name || comment.author.username}
            </Link>
            <span className="text-xs text-gray-500">@{comment.author.username}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-400">
              {new Date(comment.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {comment.content}
          </p>
          {comment.imageUrl && (
            <div className="mt-2 rounded-lg overflow-hidden max-h-40">
              <img
                src={comment.imageUrl}
                alt="Comment image"
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
