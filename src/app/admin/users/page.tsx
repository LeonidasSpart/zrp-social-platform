"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Shield, ShieldAlert, ShieldCheck, User } from "lucide-react";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  createdAt: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  badgeType: string | null;
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
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to update role");
      }
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Something went wrong");
    }
  };

  const setBadge = async (userId: string, badgeType: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badgeType: badgeType || null }),
      });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error updating badge:", error);
    }
  };

  const getRoleIcon = (role: string) => {
    const option = ROLE_OPTIONS.find((r) => r.value === role);
    if (!option) return <User className="w-4 h-4" />;
    const Icon = option.icon;
    return <Icon className="w-4 h-4" />;
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Users</h1>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">User</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">Email</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">Posts</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">Role</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">Badge</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition">
                  <td className="px-4 py-3">
                    <Link href={`/profile/${user.username}`} className="hover:underline">
                      <span className="font-medium text-gray-900 dark:text-white">{user.name || user.username}</span>
                      <span className="text-gray-500 text-xs ml-1">@{user.username}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user.email}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{user._count.posts}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        {getRoleIcon(user.role)}
                      </span>
                      <select
                        value={user.role}
                        onChange={(e) => updateRole(user.id, e.target.value)}
                        className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                      className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {BADGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-gray-700 dark:text-gray-300">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
