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
  Settings,
  DollarSign,
} from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Moderators (role: "MODERATOR") were previously bounced from every
  // admin page here, even though the backend's requireStaff() helper
  // (now used by reports/posts/users-list/ban/stats) was already
  // designed to let them in. This was the actual root gate blocking
  // them - Header/Sidebar also hid the link to get here, but even a
  // moderator who typed /admin directly would land right back on "/".
  const isStaff = session?.user?.isAdmin || session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  useEffect(() => {
    if (status === "loading") return;
    if (!session || !isStaff) {
      router.push("/");
    }
  }, [session, status, isStaff, router]);

  if (status === "loading") {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!session || !isStaff) {
    return null;
  }

  const isFullAdmin = session?.user?.isAdmin || session?.user?.role === "ADMIN";

  const navItems = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/posts", label: "Posts", icon: FileText },
    { href: "/admin/reports", label: "Reports", icon: Flag },
    // Ad review is requireStaff() on the backend (same as Reports/Posts),
    // so it's visible here to moderators too, not gated to full admins.
    { href: "/admin/ads", label: "Ad Review", icon: Megaphone },
    // Upgrade Requests handles plan/billing changes and stays on the
    // stricter requireAdmin() check on the backend (see its route),
    // so it's hidden here for moderators - showing it would just lead
    // to a 403 when they clicked in, since they're not full admins.
    ...(isFullAdmin ? [{ href: "/admin/upgrade-requests", label: "Upgrade Requests", icon: DollarSign }] : []),
  ];

  return (
    <div className="max-w-5xl mx-auto py-4 px-4">
      <div className="flex flex-col md:flex-row gap-6">
        <aside className="md:w-64 flex-shrink-0">
          <div className="bg-white dark:bg-zrp-deepBlack rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Admin</h2>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                      isActive
                        ? "bg-zrp-red/10 text-zrp-red dark:bg-zrp-red/20 dark:text-zrp-red"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
