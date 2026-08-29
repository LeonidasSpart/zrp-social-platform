"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  FileText,
  Flag,
  Megaphone,
  DollarSign,
  Newspaper,
  BadgeCheck,
  HardDrive,
  Scale,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Admins and moderators can access the admin area.
  const isStaff =
    session?.user?.isAdmin ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "MODERATOR";

  useEffect(() => {
    if (status === "loading") return;

    if (!session || !isStaff) {
      router.push("/");
    }
  }, [session, status, isStaff, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!session || !isStaff) {
    return null;
  }

  const isFullAdmin =
    session?.user?.isAdmin || session?.user?.role === "ADMIN";

  const navItems: Array<{
    href: string;
    labelKey: TranslationKey;
    icon: typeof LayoutDashboard;
  }> = [
    {
      href: "/admin",
      labelKey: "adminDash.title",
      icon: LayoutDashboard,
    },
    {
      href: "/admin/users",
      labelKey: "adminUsers.title",
      icon: Users,
    },
    {
      href: "/admin/posts",
      labelKey: "adminPosts.title",
      icon: FileText,
    },
    {
      href: "/admin/news",
      labelKey: "nav.news",
      icon: Newspaper,
    },
    {
      href: "/admin/journalists",
      labelKey: "adminJournalists.title",
      icon: BadgeCheck,
    },
    {
      href: "/admin/reports",
      labelKey: "adminReports.title",
      icon: Flag,
    },
    {
      href: "/admin/appeals",
      labelKey: "adminAppeals.title",
      icon: Scale,
    },
    {
      href: "/admin/ads",
      labelKey: "adminNav.adReview",
      icon: Megaphone,
    },

    // Upgrade Requests and Storage Cleanup require full admin access.
    ...(isFullAdmin
      ? [
          {
            href: "/admin/upgrade-requests",
            labelKey: "upgradeReq.title" as TranslationKey,
            icon: DollarSign,
          },
          {
            href: "/admin/storage",
            labelKey: "adminStorage.title" as TranslationKey,
            icon: HardDrive,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <div className="flex flex-col gap-6 md:flex-row">
        {/* Sidebar */}
        <aside className="flex-shrink-0 md:w-64">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-zrp-deepBlack">
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
              {t("nav.admin")}
            </h2>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/admin" &&
                    pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 transition ${
                      isActive
                        ? "bg-zrp-red/10 text-zrp-red dark:bg-zrp-red/20 dark:text-zrp-red"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />

                    <span>{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
