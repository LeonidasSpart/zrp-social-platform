"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { Home, Compass, Search, MessageSquare, Bell, User, Sun, Moon, Menu, X, LayoutDashboard, Bookmark, LogOut, Globe } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { SUPPORTED_LANGUAGES } from "@/lib/translations";

// ─── Type for navigation items ──────────────────────────────────────
type NavItem = {
  href: string;
  icon: React.ElementType | null;
  label: string;
  badge?: number; // optional badge count
};

export default function Header() {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const isAuthenticated = !!session;

  useEffect(() => {
    if (isAuthenticated) {
      fetchUnreadCount();
    }
  }, [isAuthenticated]);

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch("/api/notifications/unread");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─── Public nav links ──────────────────────────────────────────────
  const publicNavLinks: NavItem[] = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/about", icon: null, label: t("nav.about") },
    { href: "/login", icon: null, label: t("nav.login") },
    { href: "/signup", icon: null, label: t("nav.signup") },
  ];

  // ─── Authenticated nav links ──────────────────────────────────────
  const authNavLinks: NavItem[] = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/explore", icon: Compass, label: t("nav.explore") },
    { href: "/search", icon: Search, label: t("nav.search") },
    { href: "/messages", icon: MessageSquare, label: t("nav.messages") },
    { href: "/notifications", icon: Bell, label: t("nav.notifications"), badge: unreadCount },
    { href: "/bookmarks", icon: Bookmark, label: t("nav.bookmarks") },
    { href: `/profile/${session?.user?.username}`, icon: User, label: t("nav.profile") },
  ];

  const navLinks = isAuthenticated ? authNavLinks : publicNavLinks;

  // ─── Handle logout ──────────────────────────────────────────────────
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const currentLangLabel = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.code.toUpperCase() || "EN";

  return (
    <>
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* ─── Logo ─── */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/logo.png"
              alt="ZRP"
              width={90}
              height={90}
              className="w-10 h-10 object-contain"
            />
          </Link>

          <nav className="hidden md:flex items-center gap-4">
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

            {/* ─── Language switcher ───────────────────────────────── */}
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
                title={t("nav.language")}
              >
                <Globe className="w-5 h-5" />
                <span className="text-xs font-medium">{currentLangLabel}</span>
              </button>
              {langMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setLangMenuOpen(false)}
                  />
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
                </>
              )}
            </div>

            <button
              onClick={toggleTheme}
              className="text-gray-500 dark:text-gray-400 hover:text-zrp-red dark:hover:text-zrp-red transition"
              title={theme === "light" ? t("nav.darkMode") : t("nav.lightMode")}
            >
              {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            {/* ─── LOGOUT ────────────────────────────────────────────── */}
            {isAuthenticated && (
              <button
                onClick={handleLogout}
                className="text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-500 transition"
                title={t("nav.signOut")}
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
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
        <div className="md:hidden fixed inset-x-0 top-[57px] bottom-0 bg-white dark:bg-gray-900 z-40 px-4 py-6 border-t border-gray-200 dark:border-gray-800 overflow-y-auto">
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

            {/* ─── Language switcher (mobile) ─────────────────────── */}
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

            {/* ─── LOGOUT (mobile) ──────────────────────────────────── */}
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
