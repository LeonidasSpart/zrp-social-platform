"use client";

import { Users, UserPlus } from "lucide-react";

interface AudienceDay {
  date: string;
  newFollowers: number;
  totalFollowers: number;
}

interface AudienceGrowthTabProps {
  totalFollowers: number;
  newFollowersInWindow: number;
  trend: AudienceDay[];
}

export default function AudienceGrowthTab({ totalFollowers, newFollowersInWindow, trend }: AudienceGrowthTabProps) {
  const minTotal = Math.min(...trend.map((d) => d.totalFollowers));
  const maxTotal = Math.max(1, ...trend.map((d) => d.totalFollowers));
  const range = Math.max(1, maxTotal - minTotal);

  return (
    <div className="space-y-8">
      {/* ─── Totals row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Users className="w-4 h-4" /> Total followers
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{totalFollowers.toLocaleString()}</p>
        </div>
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <UserPlus className="w-4 h-4" /> New, last 30 days
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
            {newFollowersInWindow > 0 ? "+" : ""}{newFollowersInWindow.toLocaleString()}
          </p>
        </div>
      </div>

      {/* ─── Growth chart ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Follower growth</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Total followers over the last 30 days.</p>
        <div className="relative h-32 border-b border-gray-200 dark:border-gray-700">
          <svg viewBox={`0 0 ${trend.length} 100`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
            <polyline
              fill="none"
              stroke="currentColor"
              className="text-zrp-red"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              points={trend
                .map((d, i) => {
                  const y = 100 - ((d.totalFollowers - minTotal) / range) * 90 - 5;
                  return `${i},${y}`;
                })
                .join(" ")}
            />
          </svg>
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-400 dark:text-gray-500">
          <span>{trend[0]?.date}</span>
          <span>{trend[trend.length - 1]?.date}</span>
        </div>
      </div>

      {/* ─── Daily breakdown ────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">New followers per day</h2>
        <div className="flex items-end gap-[2px] h-24">
          {trend.map((d) => {
            const maxNew = Math.max(1, ...trend.map((t) => t.newFollowers));
            return (
              <div
                key={d.date}
                className="flex-1 bg-zrp-red/70 hover:bg-zrp-red rounded-t transition"
                style={{ height: `${d.newFollowers === 0 ? 2 : Math.max(4, (d.newFollowers / maxNew) * 100)}%` }}
                title={`${d.date}: +${d.newFollowers}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
