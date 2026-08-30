import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { FeedItem } from "./FeedItem";

export async function FeedContent() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return <p className="p-4 text-zinc-500">Please log in to see the feed.</p>;
  }

  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { authorId: session.user.id },
        {
          author: {
            followers: {
              some: { followerId: session.user.id },
            },
          },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      author: true, // ✅ fetches all fields: no field-name errors
      likes: {
        where: { userId: session.user.id },
        select: { id: true },
      },
      reposts: {
        where: { userId: session.user.id },
        select: { id: true },
      },
      bookmarks: {
        where: { userId: session.user.id },
        select: { id: true },
      },
      _count: {
        select: {
          likes: true,
          comments: true,
          reposts: true,
        },
      },
    },
  });

  if (posts.length === 0) {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p>No posts yet. Follow someone or create your first post!</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {posts.map((post) => (
        <FeedItem key={post.id} post={post} userId={session.user.id} />
      ))}
    </div>
  );
}
