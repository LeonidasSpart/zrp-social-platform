"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import {
  Home, Compass, Search, MessageSquare, Bell, Bookmark, User,
  LayoutDashboard, Settings, Users, Key, LogOut, MoreHorizontal,
  PenSquare,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect } from "react";

type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
};

export default function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { t } = useLanguage();
  const [unreadCount, setUnreadCount] = useState(0);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const isAuthenticated = !!session;
  const features = session?.user?.features;

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/notifications/unread");
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count);
        }
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  if (!isAuthenticated) return null;

  const navItems: NavItem[] = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/explore", icon: Compass, label: t("nav.explore") },
    { href: "/search", icon: Search, label: t("nav.search") },
    { href: "/messages", icon: MessageSquare, label: t("nav.messages") },
    { href: "/notifications", icon: Bell, label: t("nav.notifications"), badge: unreadCount },
    { href: "/bookmarks", icon: Bookmark, label: t("nav.bookmarks") },
    { href: `/profile/${session?.user?.username}`, icon: User, label: t("nav.profile") },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 h-screen sticky top-0 px-2 py-4 border-r border-gray-200 dark:border-gray-800">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 px-3 py-2 mb-2">
        <Image src="/logo.png" alt="ZRP" width={40} height={40} className="w-9 h-9 object-contain" />
      </Link>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex items-center gap-4 px-3 py-2.5 rounded-full text-lg transition ${
                active
                  ? "font-bold text-gray-900 dark:text-white"
                  : "font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              <item.icon className={`w-6 h-6 ${active ? "text-zrp-red" : ""}`} />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute left-7 top-1 bg-zrp-red text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}

        {session?.user?.isAdmin && (
          <Link
            href="/admin"
            className={`flex items-center gap-4 px-3 py-2.5 rounded-full text-lg transition ${
              isActive("/admin")
                ? "font-bold text-gray-900 dark:text-white"
                : "font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <LayoutDashboard className={`w-6 h-6 ${isActive("/admin") ? "text-zrp-red" : ""}`} />
            <span>{t("nav.admin")}</span>
          </Link>
        )}

        {/* ─── More menu (Settings, Team, API Keys) ──────────────── */}
        <div className="relative">
          <button
            onClick={() => setMoreMenuOpen(!moreMenuOpen)}
            className="w-full flex items-center gap-4 px-3 py-2.5 rounded-full text-lg font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <MoreHorizontal className="w-6 h-6" />
            <span>{t("action.more") || "More"}</span>
          </button>
          {moreMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
              <div className="absolute left-0 bottom-full mb-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <Link
                  href="/settings"
                  onClick={() => setMoreMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </Link>
                {features?.teamManagement && (
                  <Link
                    href="/settings/team"
                    onClick={() => setMoreMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    <Users className="w-4 h-4" />
                    <span>Team Management</span>
                  </Link>
                )}
                {features?.apiAccess && (
                  <Link
                    href="/settings/api-keys"
                    onClick={() => setMoreMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    <Key className="w-4 h-4" />
                    <span>API Keys</span>
                  </Link>
                )}
                <hr className="my-1 border-gray-200 dark:border-gray-700" />
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full text-left px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-red-600 dark:text-red-400"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t("nav.signOut")}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* Post button */}
      <Link
        href="/"
        className="mt-4 bg-zrp-red text-white text-center py-3 rounded-full font-bold hover:bg-zrp-darkRed transition flex items-center justify-center gap-2"
      >
        <PenSquare className="w-5 h-5" />
        {t("sidebar.postButton")}
      </Link>

      {/* User mini-card */}
      {session?.user && (
        <Link
          href={`/profile/${session.user.username}`}
          className="mt-4 flex items-center gap-3 px-3 py-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <div className="w-9 h-9 rounded-full bg-zrp-red/10 flex items-center justify-center text-zrp-red font-semibold flex-shrink-0 overflow-hidden">
            {session.user.avatarUrl ? (
              <img src={session.user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              session.user.name?.[0]?.toUpperCase() || "?"
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {session.user.name || session.user.username}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              @{session.user.username}
            </p>
          </div>
        </Link>
      )}
    </aside>
  );
}
