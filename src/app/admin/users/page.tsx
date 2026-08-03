"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, User, Shield, ShieldAlert, Ban, CheckCircle } from "lucide-react";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  badgeType: string | null;
  banned: boolean; // ✅ added
  _count: {
    posts: number;
    comments: number;
  };
}

const BADGE_OPTIONS = [
  { value: "", label: "None" },
  { value: "verified", label: "Verified (blue)" },
  { value: "organization", label: "Organization (gold)" },
  { value: "government", label: "Government (gray)" },
];

const ROLE_OPTIONS = [
  { value: "USER", label: "User", icon: User },
  { value: "MODERATOR", label: "Moderator", icon: Shield },
  { value: "ADMIN", label: "Admin", icon: ShieldAlert },
];

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(search)}&page=${page}`);
      const data = await res.json();
      setUsers(data.users);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) fetchUsers();
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) fetchUsers();
    } catch (error) {
      console.error("Role update error:", error);
    }
  };

  const setBadge = async (userId: string, badgeType: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badgeType: badgeType || null }),
      });
      if (res.ok) fetchUsers();
    } catch (error) {
      console.error("Badge update error:", error);
    }
  };

  // ─── BAN / UNBAN ─────────────────────────────────────────────────────
  const toggleBan = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? "unban" : "ban";
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, { method: "POST" });
      if (res.ok) fetchUsers();
      else {
        const err = await res.json();
        alert(err.error || "Failed to toggle ban");
      }
    } catch (error) {
      console.error("Ban toggle error:", error);
      alert("Failed to toggle ban");
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading users...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">User</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Email</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Posts</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Role</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Badge</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Status</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => {
                const RoleIcon = ROLE_OPTIONS.find(r => r.value === user.role)?.icon || User;
                return (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/profile/${user.username}`} className="hover:underline">
                        <span className="font-medium text-gray-900 dark:text-white">{user.name || user.username}</span>
                        <span className="text-gray-500 text-xs ml-1">@{user.username}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 truncate max-w-[150px]">
                      {user.email}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user._count.posts}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RoleIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <select
                          value={user.role}
                          onChange={(e) => updateRole(user.id, e.target.value)}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.badgeType || ""}
                        onChange={(e) => setBadge(user.id, e.target.value)}
                        className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
                      >
                        {BADGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {user.banned ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                          <Ban className="w-3 h-3" /> Banned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                          <CheckCircle className="w-3 h-3" /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 space-x-2">
                      <button
                        onClick={() => toggleBan(user.id, user.banned)}
                        className={`text-xs font-medium transition ${
                          user.banned
                            ? "text-green-600 hover:text-green-800"
                            : "text-red-600 hover:text-red-800"
                        }`}
                      >
                        {user.banned ? "Unban" : "Ban"}
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Previous
          </button>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
