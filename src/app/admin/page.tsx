"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, FileText, MessageCircle, Flag, UserCheck, UserPlus, Activity } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";

interface Stats {
  users: number;
  posts: number;
  comments: number;
  reports: number;
  pendingReports: number;
  roleCounts: {
    USER: number;
    MODERATOR: number;
    ADMIN: number;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  const cards = [
    { label: "Total Users", value: stats?.users || 0, icon: Users, color: "blue" },
    { label: "Total Posts", value: stats?.posts || 0, icon: FileText, color: "green" },
    { label: "Total Comments", value: stats?.comments || 0, icon: MessageCircle, color: "purple" },
    { label: "Pending Reports", value: stats?.pendingReports || 0, icon: Flag, color: "red" },
    { label: "Admins", value: stats?.roleCounts?.ADMIN || 0, icon: UserCheck, color: "orange" },
    { label: "Moderators", value: stats?.roleCounts?.MODERATOR || 0, icon: UserPlus, color: "indigo" },
  ];

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Activity className="w-4 h-4" />
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</p>
              </div>
              <div className={`p-3 rounded-full bg-${card.color}-100 dark:bg-${card.color}-900/20`}>
                <card.icon className={`w-5 h-5 text-${card.color}-600 dark:text-${card.color}-400`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">User Roles</h2>
          <div className="space-y-2">
            {stats?.roleCounts && Object.entries(stats.roleCounts).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{role}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link href="/admin/users" className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition">
              → Manage Users
            </Link>
            <Link href="/admin/posts" className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition">
              → Manage Posts
            </Link>
            <Link href="/admin/reports" className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition">
              → View Reports ({stats?.pendingReports || 0} pending)
            </Link>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
