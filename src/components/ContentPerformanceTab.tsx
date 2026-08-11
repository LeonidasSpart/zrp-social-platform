"use client";

import Link from "next/link";
import { Eye, Heart, MessageCircle, Repeat } from "lucide-react";

interface TopPost {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string;
  views: number;
  _count: { likes: number; comments: number; reposts: number };
  score: number;
}

interface EngagementDay {
  date: string;
  likes: number;
  comments: number;
  reposts: number;
  total: number;
}

interface ContentPerformanceTabProps {
  topPosts: TopPost[];
  engagementTrend: EngagementDay[];
  totals: { views: number; likes: number; comments: number; reposts: number; postCount: number };
}

function formatCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

export default function ContentPerformanceTab({ topPosts, engagementTrend, totals }: ContentPerformanceTabProps) {
  const maxDay = Math.max(1, ...engagementTrend.map((d) => d.total));

  return (
    <div className="space-y-8">
      {/* ─── Totals row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Eye className="w-4 h-4" /> Views
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{formatCount(totals.views)}</p>
        </div>
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Heart className="w-4 h-4" /> Likes
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{formatCount(totals.likes)}</p>
        </div>
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <MessageCircle className="w-4 h-4" /> Comments
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{formatCount(totals.comments)}</p>
        </div>
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Repeat className="w-4 h-4" /> Reposts
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{formatCount(totals.reposts)}</p>
        </div>
      </div>

      {/* ─── Engagement trend (last 30 days) ────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Engagement, last 30 days</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Likes, comments, and reposts across all your posts.</p>
        <div className="flex items-end gap-[2px] h-32 border-b border-gray-200 dark:border-gray-700 pb-1">
          {engagementTrend.map((d) => (
            <div
              key={d.date}
              className="flex-1 bg-zrp-red/70 hover:bg-zrp-red rounded-t transition"
              style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }}
              title={`${d.date}: ${d.total} engagement${d.total === 1 ? "" : "s"}`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-400 dark:text-gray-500">
          <span>{engagementTrend[0]?.date}</span>
          <span>{engagementTrend[engagementTrend.length - 1]?.date}</span>
        </div>
      </div>

      {/* ─── Top posts ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Top posts</h2>
        {topPosts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">No posts yet.</div>
        ) : (
          <div className="space-y-3">
            {topPosts.map((post, i) => (
              <Link
                key={post.id}
                href={`/post/${post.id}`}
                className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <span className="flex-shrink-0 w-6 text-center font-bold text-gray-400 dark:text-gray-500">
                  {i + 1}
                </span>
                {post.imageUrl && (
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800">
                    <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">{post.content || "(media post)"}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {formatCount(post.views)}</span>
                    <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {formatCount(post._count.likes)}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {formatCount(post._count.comments)}</span>
                    <span className="flex items-center gap-1"><Repeat className="w-3 h-3" /> {formatCount(post._count.reposts)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
