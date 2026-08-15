"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import {
  Home,
  Compass,
  Search,
  MessageSquare,
  Bell,
  User,
  Sun,
  Moon,
  Menu,
  X,
  LayoutDashboard,
  Bookmark,
  LogOut,
  Film,
  Globe,
  Settings,
  Users,
  Key,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";
import { getSocket } from "@/lib/socket-client";
import { useUnreadCount } from "@/contexts/UnreadCountContext";

// ─── Type for navigation items ──────────────────────────────────────
type NavItem = {
  href: string;
  icon: React.ElementType | null;
  label: string;
  badge?: number;
};

export default function Header() {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { unreadCount } = useUnreadCount();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAuthenticated = !!session;
  const features = session?.user?.features;

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
        setUserMenuOpen(false);
        setLangMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Socket listener for block updates
  useEffect(() => {
    if (!session?.user?.id) return;
    const socket = getSocket(session.user.id);
    socket.on("block-updated", ({ blockerId, blockedId }) => {
      if (blockerId === session.user.id) {
        window.location.reload();
      }
    });
    return () => {
      socket.off("block-updated");
    };
  }, [session]);

  // Public nav links
  const publicNavLinks: NavItem[] = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/about", icon: null, label: t("nav.about") },
    { href: "/login", icon: null, label: t("nav.login") },
    { href: "/signup", icon: null, label: t("nav.signup") },
  ];

  // Authenticated nav links (excludes User icon – we'll use dropdown)
  const authNavLinks: NavItem[] = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/shorts", icon: Film, label: "Shorts" },
    { href: "/explore", icon: Compass, label: t("nav.explore") },
    { href: "/search", icon: Search, label: t("nav.search") },
    { href: "/messages", icon: MessageSquare, label: t("nav.messages") },
    { href: "/notifications", icon: Bell, label: t("nav.notifications"), badge: unreadCount },
    { href: "/bookmarks", icon: Bookmark, label: t("nav.bookmarks") },
  ];

  const navLinks = isAuthenticated ? authNavLinks : publicNavLinks;

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
    setUserMenuOpen(false);
  };

  const currentLangLabel = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.code.toUpperCase() || "EN";

  // ─── Close dropdowns when clicking outside ──────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".user-menu")) {
        setUserMenuOpen(false);
      }
      if (!target.closest(".lang-menu")) {
        setLangMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <>
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-zrp-deepBlack sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/logo.png"
              alt="ZRP"
              width={90}
              height={90}
              className="w-12 h-12 object-contain"
            />
          </Link>

          <nav className="hidden md:flex lg:hidden items-center gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
                title={link.label}
              >
                {link.icon && <link.icon className="w-5 h-5" />}
                {link.badge !== undefined && link.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {link.badge > 9 ? "9+" : link.badge}
                  </span>
                )}
              </Link>
            ))}

            {isAuthenticated && session?.user?.isAdmin && (
              <Link
                href="/admin"
                className="text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
                title={t("nav.admin")}
              >
                <LayoutDashboard className="w-5 h-5" />
              </Link>
            )}

            {/* ─── User dropdown ───────────────────────────────────── */}
            {isAuthenticated && (
              <div className="relative user-menu">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserMenuOpen(!userMenuOpen);
                  }}
                  className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
                  title={t("nav.profile")}
                >
                  <User className="w-5 h-5" />
                  <ChevronDown className="w-4 h-4" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                    <Link
                      href={`/profile/${session.user.username}`}
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      <User className="w-4 h-4" />
                      <span>{t("nav.profile")}</span>
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </Link>

                    {/* Team Management (only if eligible) */}
                    {features?.teamManagement && (
                      <Link
                        href="/settings/team"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        <Users className="w-4 h-4" />
                        <span>Team Management</span>
                      </Link>
                    )}

                    {/* API Keys (only if eligible) */}
                    {features?.apiAccess && (
                      <Link
                        href="/settings/api-keys"
                        onClick={() => setUserMenuOpen(false)}
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
                )}
              </div>
            )}

            {/* ─── Language switcher ───────────────────────────────── */}
            <div className="relative lang-menu">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLangMenuOpen(!langMenuOpen);
                }}
                className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
                title={t("nav.language")}
              >
                <Globe className="w-5 h-5" />
                <span className="text-xs font-medium">{currentLangLabel}</span>
              </button>
              {langMenuOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 overflow-hidden">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code);
                        setLangMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition ${
                        language === lang.code
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                          : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={toggleTheme}
              className="text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
              title={theme === "light" ? t("nav.darkMode") : t("nav.lightMode")}
            >
              {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            {/* ─── LOGOUT (standalone) – now we have it in dropdown, so we can remove this button ─── */}
            {/* We'll remove the standalone logout button to avoid duplication */}
          </nav>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* ─── Mobile Menu ─── */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-[57px] bottom-0 bg-white dark:bg-zrp-deepBlack z-40 px-4 py-6 border-t border-gray-200 dark:border-gray-800 overflow-y-auto">
          <nav className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
              >
                {link.icon && <link.icon className="w-5 h-5" />}
                <span>{link.label}</span>
                {link.badge !== undefined && link.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 ml-auto">
                    {link.badge > 9 ? "9+" : link.badge}
                  </span>
                )}
              </Link>
            ))}
            {isAuthenticated && session?.user?.isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>{t("nav.admin")}</span>
              </Link>
            )}

            {/* Mobile: User menu items */}
            {isAuthenticated && (
              <>
                <hr className="my-2 border-gray-200 dark:border-gray-700" />
                <Link
                  href={`/profile/${session.user.username}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
                >
                  <User className="w-5 h-5" />
                  <span>{t("nav.profile")}</span>
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
                >
                  <Settings className="w-5 h-5" />
                  <span>Settings</span>
                </Link>
                {features?.teamManagement && (
                  <Link
                    href="/settings/team"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
                  >
                    <Users className="w-5 h-5" />
                    <span>Team Management</span>
                  </Link>
                )}
                {features?.apiAccess && (
                  <Link
                    href="/settings/api-keys"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
                  >
                    <Key className="w-5 h-5" />
                    <span>API Keys</span>
                  </Link>
                )}
              </>
            )}

            {/* Language switcher (mobile) */}
            <div className="p-3">
              <p className="text-xs text-gray-400 mb-2">{t("nav.language")}</p>
              <div className="flex gap-2 flex-wrap">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                      language === lang.code
                        ? "bg-zrp-red text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {lang.code.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-gray-700 dark:text-gray-300"
            >
              {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              <span>{theme === "light" ? t("nav.darkMode") : t("nav.lightMode")}</span>
            </button>

            {isAuthenticated && (
              <button
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition text-red-600 dark:text-red-400"
              >
                <LogOut className="w-5 h-5" />
                <span>{t("nav.signOut")}</span>
              </button>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
