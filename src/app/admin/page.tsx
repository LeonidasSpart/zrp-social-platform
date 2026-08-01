"use client";

import { useEffect, useState } from "react";
import { Users, FileText, MessageCircle, Flag } from "lucide-react";

interface Stats {
  users: number;
  posts: number;
  comments: number;
  pendingReports: number;
  blocked: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading stats...</div>;
  }

  if (!stats) {
    return <div className="text-center py-12 text-red-500">Failed to load stats</div>;
  }

  const cards = [
    { label: "Total Users", value: stats.users, icon: Users, color: "blue" },
    { label: "Total Posts", value: stats.posts, icon: FileText, color: "green" },
    { label: "Total Comments", value: stats.comments, icon: MessageCircle, color: "purple" },
    { label: "Pending Reports", value: stats.pendingReports, icon: Flag, color: "red" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
              </div>
              <div className={`p-3 rounded-full bg-${card.color}-100 dark:bg-${card.color}-900/20`}>
                <card.icon className={`w-6 h-6 text-${card.color}-600 dark:text-${card.color}-400`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
