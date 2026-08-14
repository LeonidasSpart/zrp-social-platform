"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search, User, Shield, ShieldAlert, Ban, CheckCircle,
  BadgeCheck, Building2, Landmark, Circle, CircleDot,
  ChevronDown, ChevronUp, Users, UserX, UserCheck, Award
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  badgeType: string | null;
  banned: boolean;
  plan: string;
  _count: {
    posts: number;
    comments: number;
  };
}

export default function AdminUsers() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [badgeFilter, setBadgeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Real aggregate counts across the whole (search-filtered) dataset,
  // from the server - not derived from just the current page of users,
  // which is why "Total" used to always cap out at the page size (20)
  // instead of matching the real user count shown on the Dashboard.
  const [stats, setStats] = useState({ total: 0, active: 0, banned: 0, admins: 0, mods: 0 });

  const ROLE_OPTIONS = [
    { value: "USER", label: t("adminUsers.roleUser"), icon: User, color: "bg-gray-100 text-gray-700" },
    { value: "MODERATOR", label: t("adminUsers.roleModerator"), icon: Shield, color: "bg-orange-100 text-orange-700" },
    { value: "ADMIN", label: t("adminUsers.roleAdmin"), icon: ShieldAlert, color: "bg-rose-100 text-rose-700" },
  ];

  const BADGE_OPTIONS = [
    { value: "", label: t("adminUsers.badgeNone"), color: "bg-gray-100 text-gray-400" },
    { value: "verified", label: t("adminUsers.badgeVerified"), icon: BadgeCheck, color: "bg-blue-100 text-blue-700" },
    { value: "organization", label: t("adminUsers.badgeOrganization"), icon: Building2, color: "bg-yellow-100 text-yellow-700" },
    { value: "government", label: t("adminUsers.badgeGovernment"), icon: Landmark, color: "bg-gray-200 text-gray-700" },
    { value: "team", label: t("adminUsers.badgeTeam") || "ZRP Team", icon: Award, color: "bg-red-100 text-red-700" },
  ];

  const STATUS_OPTIONS = [
    { value: "ALL", label: t("adminUsers.statusAll") },
    { value: "ACTIVE", label: t("adminUsers.statusActive") },
    { value: "BANNED", label: t("adminUsers.statusBanned") },
  ];

  const PLAN_OPTIONS = [
    { value: "free", label: t("adminUsers.planFree") },
    { value: "pro", label: t("adminUsers.planPro") },
    { value: "business", label: t("adminUsers.planBusiness") },
    { value: "enterprise", label: t("adminUsers.planEnterprise") },
  ];

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        page: String(page),
        role: roleFilter,
        badge: badgeFilter,
        status: statusFilter,
      });
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      setUsers(data.users);
      setTotalPages(data.totalPages);
      if (data.stats) setStats(data.stats);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search, roleFilter, badgeFilter, statusFilter]);

  // Filters are now applied server-side (role/badge/status query params
  // above), so `users` already reflects them - no client-side re-filter
  // needed anymore. Filtering on the current page's 20 rows used to mean
  // e.g. selecting "Admins" could show nothing if the one admin happened
  // to be on a different page than the one currently loaded.
  const filteredUsers = users;

  // ─── Stats: real totals from the server (not just this page) ──────
  const total = stats.total;
  const active = stats.active;
  const banned = stats.banned;
  const admins = stats.admins;
  const mods = stats.mods;

  const handleDelete = async (userId: string) => {
    if (!confirm(t("adminUsers.deleteConfirm"))) return;
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
    const actionLabel = currentStatus ? t("adminUsers.unban").toLowerCase() : t("adminUsers.ban").toLowerCase();
    if (!confirm(t("adminUsers.banConfirm", { action: actionLabel }))) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, { method: "POST" });
      if (res.ok) fetchUsers();
      else {
        const err = await res.json();
        alert(err.error || t("adminUsers.errToggleBan"));
      }
    } catch (error) {
      console.error("Ban toggle error:", error);
      alert(t("adminUsers.errToggleBan"));
    }
  };

  // ─── Update user plan ──────────────────────────────────────────────
  const updatePlan = async (userId: string, newPlan: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const err = await res.json();
        alert(err.error || t("adminUsers.errUpdatePlan"));
      }
    } catch (error) {
      console.error("Plan update error:", error);
      alert(t("adminUsers.errUpdatePlan"));
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminUsers.title")}</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t("adminUsers.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
          />
        </div>
      </div>

      {/* ─── Stats Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <Users className="w-5 h-5 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminUsers.total")}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{total}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminUsers.active")}</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{active}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <Ban className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminUsers.banned")}</p>
            <p className="text-lg font-bold text-red-600 dark:text-red-400">{banned}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminUsers.admins")}</p>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{admins}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3 flex items-center gap-3">
          <Shield className="w-5 h-5 text-orange-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("adminUsers.mods")}</p>
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{mods}</p>
          </div>
        </div>
      </div>

      {/* ─── Filters ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
        >
          <option value="ALL">{t("adminUsers.allRoles")}</option>
          <option value="USER">{t("adminUsers.roleUser")}</option>
          <option value="MODERATOR">{t("adminUsers.roleModerator")}</option>
          <option value="ADMIN">{t("adminUsers.roleAdmin")}</option>
        </select>

        <select
          value={badgeFilter}
          onChange={(e) => { setBadgeFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
        >
          <option value="ALL">{t("adminUsers.allBadges")}</option>
          <option value="NONE">{t("adminUsers.badgeNone")}</option>
          <option value="verified">{t("adminUsers.badgeVerified")}</option>
          <option value="organization">{t("adminUsers.badgeOrganization")}</option>
          <option value="government">{t("adminUsers.badgeGovernment")}</option>
          <option value="team">{t("adminUsers.badgeTeam") || "ZRP Team"}</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-zrp-red focus:border-transparent"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
          {t("adminUsers.usersShown", { n: filteredUsers.length })}
        </span>
      </div>

      {/* ─── Table ──────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium whitespace-nowrap">{t("adminUsers.colUser")}</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium hidden sm:table-cell whitespace-nowrap">{t("adminUsers.colEmail")}</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium whitespace-nowrap">{t("adminUsers.colPosts")}</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium whitespace-nowrap">{t("adminUsers.colRole")}</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium whitespace-nowrap">{t("adminUsers.colBadge")}</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium whitespace-nowrap">{t("adminUsers.colPlan")}</th>
                <th className="px-4 py-3 text-left text-gray-500 dark:text-gray-300 font-medium whitespace-nowrap">{t("adminUsers.colStatus")}</th>
                <th className="px-4 py-3 text-right text-gray-500 dark:text-gray-300 font-medium whitespace-nowrap">{t("adminUsers.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {t("adminUsers.noMatch")}
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
                      {/* ─── Plan column ───────────────────────────── */}
                      <td className="px-4 py-3">
                        <select
                          value={user.plan || "free"}
                          onChange={(e) => updatePlan(user.id, e.target.value)}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
                        >
                          {PLAN_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {user.banned ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                            <Circle className="w-2 h-2 fill-red-600" /> {t("adminUsers.statusBanned")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                            <CircleDot className="w-2 h-2 fill-green-600" /> {t("adminUsers.statusActive")}
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
                          {user.banned ? t("adminUsers.unban") : t("adminUsers.ban")}
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium transition"
                        >
                          {t("adminUsers.delete")}
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
            {t("adminUsers.previous")}
          </button>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {t("adminUsers.pageOf", { page, total: totalPages })}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {t("adminUsers.next")}
          </button>
        </div>
      )}
    </div>
  );
}
