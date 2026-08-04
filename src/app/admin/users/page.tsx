"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search, User, Shield, ShieldAlert, Ban, CheckCircle,
  BadgeCheck, Building2, Landmark, Circle, CircleDot,
  ChevronDown, ChevronUp, Users, UserX, UserCheck, Award
} from "lucide-react";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  badgeType: string | null;
  banned: boolean;
  _count: {
    posts: number;
    comments: number;
  };
}

const ROLE_OPTIONS = [
  { value: "USER", label: "User", icon: User, color: "bg-gray-100 text-gray-700" },
  { value: "MODERATOR", label: "Moderator", icon: Shield, color: "bg-orange-100 text-orange-700" },
  { value: "ADMIN", label: "Admin", icon: ShieldAlert, color: "bg-rose-100 text-rose-700" },
];

const BADGE_OPTIONS = [
  { value: "", label: "None", color: "bg-gray-100 text-gray-400" },
  { value: "verified", label: "Verified", icon: BadgeCheck, color: "bg-blue-100 text-blue-700" },
  { value: "organization", label: "Organization", icon: Building2, color: "bg-yellow-100 text-yellow-700" },
  { value: "government", label: "Government", icon: Landmark, color: "bg-gray-200 text-gray-700" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "BANNED", label: "Banned" },
];

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [badgeFilter, setBadgeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
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

  // ─── Client‑side filtering ──────────────────────────────────────────
  const filteredUsers = users.filter((user) => {
    if (roleFilter !== "ALL" && user.role !== roleFilter) return false;
    if (badgeFilter !== "ALL") {
      const badge = user.badgeType || "";
      if (badgeFilter === "NONE" && badge !== "") return false;
      if (badgeFilter !== "NONE" && badge !== badgeFilter) return false;
    }
    if (statusFilter === "ACTIVE" && user.banned) return false;
    if (statusFilter === "BANNED" && !user.banned) return false;
    return true;
  });

  // ─── Stats from filtered data ──────────────────────────────────────
  const total = filteredUsers.length;
  const active = filteredUsers.filter(u => !u.banned).length;
  const banned = filteredUsers.filter(u => u.banned).length;
  const admins = filteredUsers.filter(u => u.role === "ADMIN").length;
  const mods = filteredUsers.filter(u => u.role === "MODERATOR").length;

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zrp-red border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      {/* ─── Header ────────────────────────────────────────────────────── */}
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

      {/* ─── Stats Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <Users className="w-5 h-5 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{total}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{active}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <Ban className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Banned</p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{banned}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Admins</p>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{admins}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <Shield className="w-5 h-5 text-orange-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Mods</p>
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{mods}</p>
          </div>
        </div>
      </div>

      {/* ─── Filters ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
        >
          <option value="ALL">All Roles</option>
          <option value="USER">User</option>
          <option value="MODERATOR">Moderator</option>
          <option value="ADMIN">Admin</option>
        </select>

        <select
          value={badgeFilter}
          onChange={(e) => setBadgeFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
        >
          <option value="ALL">All Badges</option>
          <option value="NONE">None</option>
          <option value="verified">Verified</option>
          <option value="organization">Organization</option>
          <option value="government">Government</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
          {filteredUsers.length} users shown
        </span>
      </div>

      {/* ─── Table ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">User</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Posts</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Role</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Badge</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium">Status</th>
                <th className="px-4 py-3 text-right text-gray-500 dark:text-gray-300 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No users match your filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const roleStyle = ROLE_OPTIONS.find(r => r.value === user.role)?.color || "bg-gray-100 text-gray-700";
                  const badgeInfo = BADGE_OPTIONS.find(b => b.value === user.badgeType);
                  const badgeStyle = badgeInfo?.color || "bg-gray-100 text-gray-400";
                  const BadgeIcon = badgeInfo?.icon || null;

                  // Highlight row if user has many posts
                  const rowBg = user._count.posts > 5 ? "bg-blue-50 dark:bg-blue-900/10" : "";

                  return (
                    <tr
                      key={user.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${rowBg}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/profile/${user.username}`} className="hover:underline">
                          <span className="font-medium text-gray-900 dark:text-white">{user.name || user.username}</span>
                          <span className="text-gray-500 text-xs ml-1">@{user.username}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 truncate max-w-[150px] hidden sm:table-cell">
                        {user.email}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {user._count.posts}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${roleStyle}`}>
                            {user.role === "ADMIN" && <ShieldAlert className="w-3 h-3" />}
                            {user.role === "MODERATOR" && <Shield className="w-3 h-3" />}
                            {user.role === "USER" && <User className="w-3 h-3" />}
                            {user.role}
                          </span>
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
                        <div className="flex items-center gap-2">
                          {user.badgeType ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeStyle}`}>
                              {BadgeIcon && <BadgeIcon className="w-3 h-3" />}
                              {badgeInfo?.label}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
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
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {user.banned ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                            <Circle className="w-2 h-2 fill-red-600" /> Banned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                            <CircleDot className="w-2 h-2 fill-green-600" /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Pagination ──────────────────────────────────────────────── */}
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
