const renderReplyItem = (reply: any) => {
  const postLink = reply.postId ? `/post/${reply.postId}#comment-${reply.id}` : '#';

  return (
    <Link
      href={postLink}
      className="block border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
    >
      <div className="flex items-start gap-3">
        <Link
          href={`/profile/${reply.author.username}`}
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            {reply.author.avatarUrl ? (
              <img
                src={reply.author.avatarUrl}
                alt={reply.author.name || reply.author.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold">
                {(reply.author.name || reply.author.username)[0].toUpperCase()}
              </div>
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/profile/${reply.author.username}`}
              className="font-semibold hover:underline text-gray-900 dark:text-white inline-flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {reply.author.name || reply.author.username}
              <VerifiedBadge badgeType={reply.author.badgeType} /> {/* ✅ Added */}
            </Link>
            <span className="text-sm text-gray-500">@{reply.author.username}</span>
            <span className="text-sm text-gray-400">·</span>
            <span className="text-sm text-gray-400">
              {new Date(reply.createdAt).toLocaleDateString()}
            </span>
          </div>

          {reply.replyTo && (
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Replying to{" "}
              <Link
                href={`/profile/${reply.replyTo.author.username}`}
                className="text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                @{reply.replyTo.author.username}
              </Link>
            </div>
          )}

          <p className="mt-1 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {reply.content}
          </p>

          {reply.imageUrl && (
            <div className="mt-2 rounded-lg overflow-hidden">
              <img
                src={reply.imageUrl}
                alt="Reply image"
                className="w-full max-h-60 object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};
