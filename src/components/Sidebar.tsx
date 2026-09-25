"use client";

import { Fragment, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Home, Compass, Search, MessageSquare, Bell, Bookmark, User,
  LayoutDashboard, Settings, Users, Key, LogOut, MoreHorizontal,
  PenSquare, Sun, Moon, Globe, Film, Newspaper, Store, Gamepad2,
  Briefcase, HeartHandshake, Music2, ChevronDown, Sparkles, Rocket,
  Bot, Info, LifeBuoy, Scale, ListChecks, Megaphone, Zap,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useUnreadCount } from "@/contexts/UnreadCountContext";
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
  // Was its own independent fetch+30s-poll loop for both counts,
  // duplicating UnreadCountContext's own polling and missing its
  // instant socket-driven updates entirely - Header/BottomNav already
  // read from this shared context, so Sidebar's badge could silently
  // disagree with theirs for up to 30s. One source of truth now.
  const { unreadCount, unreadMessageCount } = useUnreadCount();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);

  // The rail scrolls vertically (overflow-y-auto), which per the CSS
  // spec forces its overflow-x to "auto" too - harmless at the full
  // w-64 desktop width, where these flyouts already fit inside it, but
  // at the compact w-16 tablet rail a left-anchored flyout wider than
  // the rail itself would be silently clipped/require horizontal
  // scrolling to see. Portaling to <body> and positioning from the
  // trigger's own rect (the same fix BottomNav already uses, for the
  // same reason) keeps both flyouts fully visible at every width.
  const langButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [langMenuPos, setLangMenuPos] = useState<{ left?: number; right?: number; bottom: number; maxHeight: number } | null>(null);
  const [moreMenuPos, setMoreMenuPos] = useState<{ left?: number; right?: number; bottom: number } | null>(null);

  // In Arabic (RTL) the rail sits on the right edge of the screen, so a
  // flyout anchored by its left edge to the trigger's left edge extends
  // past the viewport (at the compact w-16 rail nearly all of a w-64
  // menu was off-screen). Anchor to the trigger's inline-start edge
  // instead: its left in LTR, its right in RTL.
  const inlineStartAnchor = (rect: DOMRect) =>
    typeof document !== "undefined" && document.documentElement.dir === "rtl"
      ? { right: window.innerWidth - rect.right }
      : { left: rect.left };

  // This flyout is anchored by its bottom edge (it opens upward, since
  // the trigger sits near the bottom of the rail) and, with 25
  // languages, is taller than the space between the trigger and the top
  // of the screen on most viewports. Without a height bound tied to
  // that actual available space, the top rows render above y=0 with no
  // way to reach them. maxHeight is recomputed on every open (and kept
  // in sync with resize/orientation-change while open) rather than
  // hardcoded, so it stays correct across iPad split-screen, browser
  // chrome changes, and orientation changes.
  const positionLangMenu = () => {
    if (!langButtonRef.current) return;
    const rect = langButtonRef.current.getBoundingClientRect();
    setLangMenuPos({
      ...inlineStartAnchor(rect),
      bottom: window.innerHeight - rect.top + 8,
      maxHeight: Math.max(rect.top - 16, 160),
    });
  };

  const toggleLangMenu = () => {
    if (!langMenuOpen) positionLangMenu();
    setLangMenuOpen((value) => !value);
  };

  useEffect(() => {
    if (!langMenuOpen) return;

    positionLangMenu();
    window.addEventListener("resize", positionLangMenu);
    window.addEventListener("orientationchange", positionLangMenu);

    return () => {
      window.removeEventListener("resize", positionLangMenu);
      window.removeEventListener("orientationchange", positionLangMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langMenuOpen]);

  const toggleMoreMenu = () => {
    if (!moreMenuOpen && moreButtonRef.current) {
      const rect = moreButtonRef.current.getBoundingClientRect();
      setMoreMenuPos({ ...inlineStartAnchor(rect), bottom: window.innerHeight - rect.top + 8 });
    }
    setMoreMenuOpen((value) => !value);
  };

  const isAuthenticated = !!session;
  const features = session?.user?.features;

  // Both popovers were dismissable by pointer only - the invisible
  // fixed backdrop each one renders catches a click, but a keyboard
  // user who opened one had no way out.
  useEffect(() => {
    if (!moreMenuOpen && !langMenuOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      // Hand focus back to the trigger that opened the flyout, instead
      // of leaving it on a now-unmounted menu item (i.e. on <body>).
      if (langMenuOpen) langButtonRef.current?.focus();
      if (moreMenuOpen) moreButtonRef.current?.focus();

      setLangMenuOpen(false);
      setMoreMenuOpen(false);
      setAboutOpen(false);
      setSupportOpen(false);
      setLegalOpen(false);
    };

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [moreMenuOpen, langMenuOpen]);

  if (
    !isAuthenticated ||
    pathname?.startsWith("/onboarding") ||
    pathname?.startsWith("/shorts") ||
    pathname?.startsWith("/discover")
  ) {
    return null;
  }

  const navItems: NavItem[] = [
    { href: "/", icon: Home, label: t("nav.home") },
    { href: "/shorts", icon: Film, label: t("nav.shorts") },
    { href: "/discover", icon: Zap, label: t("nav.discover") },
    { href: "/explore", icon: Compass, label: t("nav.explore") },
    { href: "/news", icon: Newspaper, label: t("nav.news") },
    { href: "/marketplace", icon: Store, label: t("nav.marketplace") },
    { href: "/music", icon: Music2, label: t("nav.music") },
    { href: "/communities", icon: Users, label: t("nav.communities") },
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
    { href: "/lists", icon: ListChecks, label: t("nav.lists") },
    // Previously reachable only two levels deep (More -> Support ->
    // Help Center) - the reference drawer shows Help & Support as a
    // flat top-level item, matching how Android's drawer already
    // surfaces it. The full Support hub (FAQ, Contact Support, My
    // Tickets) still lives in the More menu unchanged; this promotes
    // just the entry point people actually look for first.
    { href: "/help", icon: LifeBuoy, label: t("footer.helpCenter") },
    {
      href: `/profile/${session?.user?.username}`,
      icon: User,
      label: t("nav.profile"),
    },
  ];

  // The column is 14 rows of identical shape. These two hairlines cut
  // it into feed/discovery, the verticals, and what belongs to you -
  // grouping only, so nothing is reordered and no new label copy is
  // introduced that would need translating into all 25 languages.
  const GROUP_BREAK_AFTER = new Set(["/news", "/aid"]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  const closeMoreMenu = () => {
    setMoreMenuOpen(false);
    setAboutOpen(false);
    setSupportOpen(false);
    setLegalOpen(false);
  };

  const currentLangLabel =
    SUPPORTED_LANGUAGES.find((l) => l.code === language)?.code.toUpperCase() ||
    "EN";

  return (
    <aside
      className="
        hidden md:flex
        flex-col
        w-16 lg:w-64
        flex-shrink-0
        h-[100dvh]
        sticky
        top-0
        px-2
        py-4
        border-e
        border-gray-200
        dark:border-gray-800
        overflow-y-auto
        scrollbar-hide
      "
    >
      {/*
        The ZRP mark is deliberately not repeated here.

        Header renders on every route, signed in or out, and already
        shows it - so at lg and above the same logo painted twice, 85px
        apart (56px at the top of the header, 44px at the top of this
        column). The asset is untouched; only the duplicate render is
        gone, and Header's own logo still links to "/".
      */}
      {/* Nav items */}
      <nav
        aria-label={t("nav.primary")}
        className="flex-1 flex flex-col gap-1"
      >
        {navItems.map((item) => {
          const active = isActive(item.href);

          return (
            <Fragment key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={`relative flex items-center justify-center lg:justify-start gap-0 lg:gap-4 px-3 py-2.5 rounded-full text-lg transition ${
                active
                  ? "font-bold text-gray-900 dark:text-white"
                  : "font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {/* Weight plus a red glyph was the whole current-page
                  signal, and it reads as emphasis rather than position.
                  This marker says where you are without spending a
                  second red surface on it. */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute start-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-zrp-red"
                />
              )}

              <span className="relative inline-flex flex-shrink-0">
                <item.icon
                  className={`w-6 h-6 ${
                    active ? "text-zrp-red" : ""
                  }`}
                  strokeWidth={active ? 2.5 : 2}
                />

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -end-1.5 -top-1 bg-zrp-red text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                )}
              </span>

              <span className="hidden lg:inline">{item.label}</span>
            </Link>

            {GROUP_BREAK_AFTER.has(item.href) && (
              <div
                aria-hidden="true"
                className="mx-3 my-2 h-px bg-gray-200 dark:bg-gray-800"
              />
            )}
            </Fragment>
          );
        })}

        {/* Moderators / Admin */}
        {(session?.user?.isAdmin ||
          session?.user?.role === "ADMIN" ||
          session?.user?.role === "MODERATOR") && (
          <Link
            href="/admin"
            aria-current={isActive("/admin") ? "page" : undefined}
            aria-label={t("nav.admin")}
            className={`relative flex items-center justify-center lg:justify-start gap-0 lg:gap-4 px-3 py-2.5 rounded-full text-lg transition ${
              isActive("/admin")
                ? "font-bold text-gray-900 dark:text-white"
                : "font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {isActive("/admin") && (
              <span
                aria-hidden="true"
                className="absolute start-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-zrp-red"
              />
            )}

            <LayoutDashboard
              className={`w-6 h-6 flex-shrink-0 ${
                isActive("/admin") ? "text-zrp-red" : ""
              }`}
              strokeWidth={isActive("/admin") ? 2.5 : 2}
            />

            <span className="hidden lg:inline">{t("nav.admin")}</span>
          </Link>
        )}

        {/* Journalist */}
        {session?.user?.role === "JOURNALIST" && (
          <Link
            href="/journalist"
            aria-current={isActive("/journalist") ? "page" : undefined}
            aria-label={t("nav.journalist")}
            className={`relative flex items-center justify-center lg:justify-start gap-0 lg:gap-4 px-3 py-2.5 rounded-full text-lg transition ${
              isActive("/journalist")
                ? "font-bold text-gray-900 dark:text-white"
                : "font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {isActive("/journalist") && (
              <span
                aria-hidden="true"
                className="absolute start-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-full bg-zrp-red"
              />
            )}

            <Newspaper
              className={`w-6 h-6 flex-shrink-0 ${
                isActive("/journalist") ? "text-zrp-red" : ""
              }`}
              strokeWidth={isActive("/journalist") ? 2.5 : 2}
            />

            <span className="hidden lg:inline">{t("nav.journalist")}</span>
          </Link>
        )}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "light" ? t("nav.darkMode") : t("nav.lightMode")}
          className="w-full flex items-center justify-center lg:justify-start gap-0 lg:gap-4 px-3 py-2.5 rounded-full text-lg font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          {theme === "light" ? (
            <Moon className="w-6 h-6 flex-shrink-0" />
          ) : (
            <Sun className="w-6 h-6 flex-shrink-0" />
          )}

          <span className="hidden lg:inline">
            {theme === "light"
              ? t("nav.darkMode")
              : t("nav.lightMode")}
          </span>
        </button>

        {/* Language selector */}
        <div className="relative">
          <button
            ref={langButtonRef}
            type="button"
            onClick={toggleLangMenu}
            aria-haspopup="menu"
            aria-expanded={langMenuOpen}
            aria-label={`${t("nav.language")}: ${currentLangLabel}`}
            className="w-full flex items-center justify-center lg:justify-start gap-0 lg:gap-4 px-3 py-2.5 rounded-full text-lg font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <Globe className="w-6 h-6 flex-shrink-0" />

            <span className="hidden lg:inline">{t("nav.language")}</span>

            <span className="hidden lg:inline ms-auto text-sm text-gray-400">
              {currentLangLabel}
            </span>
          </button>

          {langMenuOpen && langMenuPos && typeof document !== "undefined" &&
            createPortal(
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setLangMenuOpen(false)}
                />

                <div
                  role="menu"
                  aria-label={t("nav.language")}
                  style={{
                    left: langMenuPos.left,
                    right: langMenuPos.right,
                    bottom: langMenuPos.bottom,
                    maxHeight: langMenuPos.maxHeight,
                  }}
                  className="fixed w-48 overflow-y-auto overscroll-contain bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      type="button"
                      role="menuitem"
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code);
                        setLangMenuOpen(false);
                      }}
                      className={`w-full text-start px-4 py-2.5 text-sm transition ${
                        language === lang.code
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                          : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </>,
              document.body
            )}
        </div>

        {/* More menu */}
        <div className="relative">
          <button
            ref={moreButtonRef}
            type="button"
            onClick={toggleMoreMenu}
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
            aria-label={t("nav.more")}
            className="w-full flex items-center justify-center lg:justify-start gap-0 lg:gap-4 px-3 py-2.5 rounded-full text-lg font-normal text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            <MoreHorizontal className="w-6 h-6 flex-shrink-0" />

            <span className="hidden lg:inline">{t("nav.more")}</span>
          </button>

          {moreMenuOpen && moreMenuPos && typeof document !== "undefined" && createPortal(
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={closeMoreMenu}
              />

              <div
                style={{ left: moreMenuPos.left, right: moreMenuPos.right, bottom: moreMenuPos.bottom }}
                className="fixed w-64 max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                <Link
                  href="/pricing"
                  onClick={closeMoreMenu}
                  className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{t("nav.premium")}</span>
                </Link>

                <Link
                  href="/creator/dashboard"
                  onClick={closeMoreMenu}
                  className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <Rocket className="w-4 h-4" />
                  <span>{t("nav.creatorStudio")}</span>
                </Link>

                <Link
                  href="/ads"
                  onClick={closeMoreMenu}
                  className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <Megaphone className="w-4 h-4" />
                  <span>{t("nav.ads")}</span>
                </Link>

                <Link
                  href="/ai"
                  onClick={closeMoreMenu}
                  className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <Bot className="w-4 h-4" />
                  <span>{t("nav.aiAssistant")}</span>
                </Link>

                <hr className="my-1 border-gray-200 dark:border-gray-700" />

                <Link
                  href="/settings"
                  onClick={closeMoreMenu}
                  className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <Settings className="w-4 h-4" />
                  <span>{t("nav.settings")}</span>
                </Link>

                {features?.teamManagement && (
                  <Link
                    href="/settings/team"
                    onClick={closeMoreMenu}
                    className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    <Users className="w-4 h-4" />
                    <span>{t("nav.teamManagement")}</span>
                  </Link>
                )}

                {features?.apiAccess && (
                  <Link
                    href="/settings/api-keys"
                    onClick={closeMoreMenu}
                    className="flex items-center gap-3 px-4 py-2.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    <Key className="w-4 h-4" />
                    <span>{t("nav.apiKeys")}</span>
                  </Link>
                )}

                <hr className="my-1 border-gray-200 dark:border-gray-700" />

                {/* About ZRP */}
                <button
                  type="button"
                  onClick={() => setAboutOpen((value) => !value)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-start text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  aria-expanded={aboutOpen}
                >
                  <Info className="w-4 h-4" />
                  <span className="flex-1">{t("nav.aboutZrp")}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${aboutOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {aboutOpen && (
                  <div className="bg-gray-50 dark:bg-gray-900/40">
                    {[
                      { href: "/about", label: t("footer.about") },
                      { href: "/careers", label: t("footer.careers") },
                      { href: "/charity", label: t("footer.charity") },
                      { href: "/transparency", label: t("footer.transparency") },
                      { href: "/press", label: t("footer.pressKit") },
                      { href: "/news", label: t("footer.zrpNews") },
                      { href: "/journalist", label: t("footer.becomeJournalist") },
                      { href: "/ambassadors", label: t("ambassadors.navLabel") },
                      { href: "/community-code", label: t("communityCode.navLabel") },
                      { href: "/investors", label: t("footer.investors") },
                      { href: "/contact", label: t("footer.contact") },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={closeMoreMenu}
                        className="block ps-11 pe-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Support */}
                <button
                  type="button"
                  onClick={() => setSupportOpen((value) => !value)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-start text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  aria-expanded={supportOpen}
                >
                  <LifeBuoy className="w-4 h-4" />
                  <span className="flex-1">{t("footer.supportHeading")}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${supportOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {supportOpen && (
                  <div className="bg-gray-50 dark:bg-gray-900/40">
                    {[
                      { href: "/faq", label: t("footer.faq") },
                      { href: "/help", label: t("footer.helpCenter") },
                      { href: "/contact", label: t("footer.contactSupport") },
                      { href: "/support/tickets", label: t("footer.myTickets") },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={closeMoreMenu}
                        className="block ps-11 pe-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Legal */}
                <button
                  type="button"
                  onClick={() => setLegalOpen((value) => !value)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-start text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  aria-expanded={legalOpen}
                >
                  <Scale className="w-4 h-4" />
                  <span className="flex-1">{t("footer.legalHeading")}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${legalOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {legalOpen && (
                  <div className="bg-gray-50 dark:bg-gray-900/40">
                    {[
                      { href: "/privacy", label: t("footer.privacyPolicy") },
                      { href: "/terms", label: t("footer.termsOfService") },
                    ].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={closeMoreMenu}
                        className="block ps-11 pe-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}

                <hr className="my-1 border-gray-200 dark:border-gray-700" />

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full text-start px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-red-600 dark:text-red-400"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t("nav.signOut")}</span>
                </button>
              </div>
            </>,
            document.body
          )}
        </div>
      </nav>

      {/* Post button */}
      <Link
        href="/"
        aria-label={t("sidebar.postButton")}
        className="mt-4 bg-zrp-red text-white text-center py-3 rounded-full font-bold hover:bg-zrp-darkRed transition flex items-center justify-center gap-2"
      >
        <PenSquare className="w-5 h-5 flex-shrink-0" />
        <span className="hidden lg:inline">{t("sidebar.postButton")}</span>
      </Link>

      {/* User mini-card */}
      {session?.user && (
        <Link
          href={`/profile/${session.user.username}`}
          aria-label={session.user.name || session.user.username || undefined}
          className="mt-4 flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition"
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

          <div className="hidden lg:block min-w-0 flex-1">
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
              <bdi>@{session.user.username}</bdi>
            </p>
          </div>
        </Link>
      )}
    </aside>
  );
}
