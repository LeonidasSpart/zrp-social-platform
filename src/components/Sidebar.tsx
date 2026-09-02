"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import {
  Home, Compass, Search, MessageSquare, Bell, Bookmark, User,
  LayoutDashboard, Settings, Users, Key, LogOut, MoreHorizontal,
  PenSquare, Sun, Moon, Globe, Film, Newspaper, Store, Gamepad2,
  Briefcase, HeartHandshake, Music2,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";
import VerifiedBadge from "@/components/VerifiedBadge";

type NavItem = {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
};

export default function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

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

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchUnreadMessages = async () => {
      try {
        const res = await fetch("/api/messages/unread");

        if (res.ok) {
          const data = await res.json();
          setUnreadMessageCount(data.count);
        }
      } catch {}
    };

    fetchUnreadMessages();

    const interval = setInterval(fetchUnreadMessages, 30000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  if (
    !isAuthenticated ||
    pathname?.startsWith("/onboarding") ||
    pathname?.startsWith("/shorts")
  ) {
    return null;
  }

  const navItems: NavItem[] = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/shorts", icon: Film, label: t("nav.shorts") },
    { href: "/explore", icon: Compass, label: t("nav.explore") },
    { href: "/news", icon: Newspaper, label: t("nav.news") },
    { href: "/marketplace", icon: Store, label: t("nav.marketplace") },
    { href: "/music", icon: Music2, label: "Music" },
    { href: "/play", icon: Gamepad2, label: t("nav.play") },
    { href: "/opportunity", icon: Briefcase, label: t("nav.opportunity") },
    { href: "/aid", icon: HeartHandshake, label: t("nav.help") },
    { href: "/search", icon: Search, label: t("nav.search") },
    {
      href: "/messages",
      icon: MessageSquare,
      label: t("nav.messages"),
      badge: unreadMessageCount,
    },
    {
      href: "/notifications",
      icon: Bell,
      label: t("nav.notifications"),
      badge: unreadCount,
    },
    { href: "/bookmarks", icon: Bookmark, label: t("nav.bookmarks") },
    {
      href: `/profile/${session?.user?.username}`,
      icon: User,
      label: t("nav.profile"),
    },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const currentLangLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === language)?.code.toUpperCase() ||
    "EN";

  return (
    <aside
      className="
        hidden lg:flex
        flex-col
        w-64
        flex-shrink-0
        h-[100dvh]
        sticky
        top-0
        px-2
        py-4
        border-r
        border-gray-200
        dark:border-gray-800
        overflow-y-auto
        scrollbar-hide
      "
    >
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2 px-3 py-2 mb-2"
      >
        <Image
          src="/logo.png"
          alt="ZRP"
          width={44}
          height={44}
          className="w-11 h-11 object-contain"
        />
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
              <item.icon
                className={`w-6 h-6 ${
                  active ? "text-zrp-red" : ""
                }`}
              />

              <span>{item.label}</span>

              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute left-7 top-1 bg-zrp-red text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* Moderators / Admin */}
        {(session?.user?.isAdmin ||
          session?.user?.role === "ADMIN" ||
          session?.user?.role === "MODERATOR") && (
          <Link
            href="/admin"
            className={`flex items-center gap-4 px-3 py-2.5 rounded-full text-lg transition ${
              isActive("/admin")
                ? "font-bold text-gray-900 dark:text-white"
                : "font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <LayoutDashboard
              className={`w-6 h-6 ${
                isActive("/admin") ? "text-zrp-red" : ""
              }`}
            />

            <span>{t("nav.admin")}</span>
          </Link>
        )}

        {/* Journalist */}
        {session?.user?.role === "JOURNALIST" && (
          <Link
            href="/journalist"
            className={`flex items-center gap-4 px-3 py-2.5 rounded-full text-lg transition ${
              isActive("/journalist")
                ? "font-bold text-gray-900 dark:text-white"
                : "font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <Newspaper
              className={`w-6 h-6 ${
                isActive("/journalist") ? "text-zrp-red" : ""
              }`}
            />

            <span>{t("nav.journalist")}</span>
          </Link>
        )}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center gap-4 px-3 py-2.5 rounded-full text-lg font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          {theme === "light" ? (
            <Moon className="w-6 h-6" />
          ) : (
            <Sun className="w-6 h-6" />
          )}

          <span>
            {theme === "light"
              ? t("nav.darkMode")
              : t("nav.lightMode")}
          </span>
        </button>

        {/* Language selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setLangMenuOpen(!langMenuOpen)}
            className="w-full flex items-center gap-4 px-3 py-2.5 rounded-full text-lg font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <Globe className="w-6 h-6" />

            <span>{t("nav.language")}</span>

            <span className="ml-auto text-sm text-gray-400">
              {currentLangLabel}
            </span>
          </button>

          {langMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setLangMenuOpen(false)}
              />

              <div className="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    type="button"
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setLangMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition ${
                      language === lang.code
                        ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* More menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreMenuOpen(!moreMenuOpen)}
            className="w-full flex items-center gap-4 px-3 py-2.5 rounded-full text-lg font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <MoreHorizontal className="w-6 h-6" />

            <span>{t("nav.more")}</span>
          </button>

          {moreMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMoreMenuOpen(false)}
              />

              <div className="absolute left-0 bottom-full mb-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <Link
                  href="/settings"
                  onClick={() => setMoreMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <Settings className="w-4 h-4" />
                  <span>{t("nav.settings")}</span>
                </Link>

                {features?.teamManagement && (
                  <Link
                    href="/settings/team"
                    onClick={() => setMoreMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    <Users className="w-4 h-4" />
                    <span>{t("nav.teamManagement")}</span>
                  </Link>
                )}

                {features?.apiAccess && (
                  <Link
                    href="/settings/api-keys"
                    onClick={() => setMoreMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    <Key className="w-4 h-4" />
                    <span>{t("nav.apiKeys")}</span>
                  </Link>
                )}

                <hr className="my-1 border-gray-200 dark:border-gray-700" />

                <button
                  type="button"
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
              <img
                src={session.user.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              session.user.name?.[0]?.toUpperCase() || "?"
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1 min-w-0">
              <span className="truncate">
                {session.user.name || session.user.username}
              </span>

              <VerifiedBadge
                badgeType={session.user.badgeType}
                className="flex-shrink-0"
              />
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
