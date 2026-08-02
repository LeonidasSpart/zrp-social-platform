"use client";

import { useEffect, useState } from "react";
import { Eye, Heart, MessageCircle, Repeat } from "lucide-react";

interface PostStats {
  id: string;
  content: string;
  createdAt: string;
  views: number;
  _count: { likes: number; comments: number; reposts: number };
}

interface Stats {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalReposts: number;
}

export default function AnalyticsTab({ userId }: { userId: string }) {
  const [posts, setPosts] = useState<PostStats[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/posts/stats")
      .then((res) => res.json())
      .then((data) => {
        setPosts(data.posts);
        setStats(data.totalStats);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-8 text-center text-gray-500">Loading analytics...</div>;
  if (!stats || posts.length === 0)
    return <div className="py-8 text-center text-gray-500">No posts yet to analyse.</div>;

  const cards = [
    { label: "Total Views", value: stats.totalViews, icon: Eye, color: "blue" },
    { label: "Total Likes", value: stats.totalLikes, icon: Heart, color: "red" },
    { label: "Total Comments", value: stats.totalComments, icon: MessageCircle, color: "green" },
    { label: "Total Reposts", value: stats.totalReposts, icon: Repeat, color: "purple" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center gap-2">
              <card.icon className={`w-5 h-5 text-${card.color}-500`} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{card.label}</span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">Recent Posts</h3>
        {posts.map((post) => (
          <div
            key={post.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
          >
            <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{post.content}</p>
            <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>👁️ {post.views}</span>
              <span>❤️ {post._count.likes}</span>
              <span>💬 {post._count.comments}</span>
              <span>🔄 {post._count.reposts}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
