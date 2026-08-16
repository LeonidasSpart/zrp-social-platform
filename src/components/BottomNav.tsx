"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Home, Search, Film, Bell, MessageSquare } from "lucide-react";
import { useUnreadCount } from "@/contexts/UnreadCountContext";
import { useLanguage } from "@/contexts/LanguageContext";

/*
 * Fixed bottom navigation for phones and tablets, matching the pattern
 * X uses on mobile: a always-visible, single-tap bar for the handful of
 * most-used destinations, rather than requiring the hamburger menu for
 * every navigation action. Only these 5 (of ZRP's 7 authenticated nav
 * items) get a permanent slot here - Explore and Bookmarks stay in the
 * existing hamburger menu, same as how X keeps less-common destinations
 * behind its own profile/drawer menu rather than the bottom bar.
 *
 * Hidden at the lg breakpoint and above, where the full Sidebar takes
 * over - this and the Sidebar are never shown at the same time.
 */
export default function BottomNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { unreadCount, unreadMessageCount } = useUnreadCount();
  const { t } = useLanguage();

  if (!session) return null;

  const items = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/search", icon: Search, label: t("nav.search") },
    { href: "/shorts", icon: Film, label: "Shorts" },
    { href: "/notifications", icon: Bell, label: t("nav.notifications"), badge: unreadCount },
    { href: "/messages", icon: MessageSquare, label: t("nav.messages"), badge: unreadMessageCount },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center justify-center flex-1 h-full"
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
                <span className="absolute top-2 right-1/2 translate-x-3 bg-red-500 text-white text-[10px] font-semibold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
