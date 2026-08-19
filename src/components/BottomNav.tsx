"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Home, Search, Film, Bell, MessageSquare, User } from "lucide-react";
import { useUnreadCount } from "@/contexts/UnreadCountContext";
import { useLanguage } from "@/contexts/LanguageContext";

/*
 * Fixed bottom navigation for phones and tablets.
 *
 * Six primary destinations are always visible:
 * Home, Search, Shorts, Notifications, Messages, Profile.
 *
 * Explore, Bookmarks and additional account/settings actions remain
 * available from the header menu.
 *
 * Hidden at the lg breakpoint and above, where the desktop Sidebar
 * takes over.
 */
export default function BottomNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { unreadCount, unreadMessageCount } = useUnreadCount();
  const { t } = useLanguage();

  if (!session) return null;

  const profileHref = `/profile/${session.user.username}`;

  const items = [
    {
      href: "/",
      icon: Home,
      label: t("nav.home"),
    },
    {
      href: "/search",
      icon: Search,
      label: t("nav.search"),
    },
    {
      href: "/shorts",
      icon: Film,
      label: "Shorts",
    },
    {
      href: "/notifications",
      icon: Bell,
      label: t("nav.notifications"),
      badge: unreadCount,
    },
    {
      href: "/messages",
      icon: MessageSquare,
      label: t("nav.messages"),
      badge: unreadMessageCount,
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const profileActive =
    pathname === profileHref ||
    pathname.startsWith(`${profileHref}/`);

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="flex items-center h-14">
        {items.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center justify-center flex-1 h-full min-w-0"
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              <item.icon
                className={`w-6 h-6 transition ${
                  active
                    ? "text-zrp-red"
                    : "text-gray-500 dark:text-gray-400"
                }`}
                strokeWidth={active ? 2.5 : 2}
              />

              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-2 left-1/2 translate-x-2 bg-zrp-red text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* Profile */}
        <Link
          href={profileHref}
          className="relative flex items-center justify-center flex-1 h-full min-w-0"
          aria-label={t("nav.profile")}
          aria-current={profileActive ? "page" : undefined}
        >
          <div
            className={`w-7 h-7 rounded-full overflow-hidden flex items-center justify-center transition ${
              profileActive
                ? "ring-2 ring-zrp-red ring-offset-1 ring-offset-white dark:ring-offset-zrp-deepBlack"
                : "ring-1 ring-gray-300 dark:ring-gray-700"
            }`}
          >
            {session.user.avatarUrl ? (
              <img
                src={session.user.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center ${
                  profileActive
                    ? "bg-zrp-red text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {session.user.name?.[0]?.toUpperCase() ||
                  session.user.username?.[0]?.toUpperCase() || (
                    <User className="w-5 h-5" />
                  )}
              </div>
            )}
          </div>
        </Link>
      </div>
    </nav>
  );
}
