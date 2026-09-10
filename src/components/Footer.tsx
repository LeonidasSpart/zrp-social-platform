"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

/*
 * Site footer for the web app, the PWA and mobile browsers.
 *
 * One quiet row, the way X's own footer works: a flat list of small
 * links that wraps, then a copyright line. No column headings, no
 * grouping blocks, no cards - those read as a second navigation menu
 * stacked under the real one, which is exactly what this replaced.
 *
 * The list is deliberately corporate/legal only (About, Careers,
 * Investors, legal pages, support) - the same thing X's own footer
 * links to. Product surfaces like Marketplace, Music, Play and ZRP AI
 * already have their own entry points in Header/Sidebar/BottomNav and
 * don't belong in a footer.
 *
 * Every label already existed in all 11 languages (the footer.*, nav.*
 * and help.footer.* namespaces the Header and Help Center use) - this
 * adds no new translation keys, and every href resolves to a real page
 * under src/app.
 */

/** Routes that own the whole viewport, where a footer would be wrong. */
const IMMERSIVE_ROUTES = [
  // Fixed inset-0 fullscreen video player.
  "/shorts",
  // Full-height conversation list + chat, with its own pinned composer.
  "/messages",
  // The moderation backoffice, which has its own chrome and its own
  // min-h-screen shell - a marketing footer under it makes no sense.
  "/admin",
];

export default function Footer() {
  const pathname = usePathname();
  const { t } = useLanguage();

  const isImmersive = IMMERSIVE_ROUTES.some(
    (route) => pathname === route || pathname?.startsWith(`${route}/`),
  );

  if (isImmersive) return null;

  const links: { href: string; label: string }[] = [
    { href: "/about", label: t("nav.aboutZrp") },
    { href: "/careers", label: t("footer.careers") },
    { href: "/investors", label: t("footer.investors") },
    { href: "/press", label: t("footer.pressKit") },
    { href: "/news", label: t("footer.zrpNews") },
    { href: "/journalist", label: t("footer.becomeJournalist") },
    { href: "/help", label: t("footer.helpCenter") },
    { href: "/contact", label: t("footer.contact") },
    { href: "/charity", label: t("footer.charity") },
    { href: "/transparency", label: t("footer.transparency") },
    { href: "/privacy", label: t("footer.privacyPolicy") },
    { href: "/terms", label: t("footer.termsOfService") },
    { href: "/guidelines", label: t("help.footer.guidelines") },
  ];

  return (
    <footer
      role="contentinfo"
      className="border-t border-gray-200 dark:border-gray-800"
    >
      {/*
        Matches the app shell's own max-width and gutter so the footer
        lines up with the feed above it rather than floating free.

        The safe-area padding is added only from lg upwards, because
        below that the shell already reserves
        pb-[calc(3.5rem+env(safe-area-inset-bottom))] for BottomNav (see
        layout.tsx) - adding it here too on a phone would count the
        inset twice.
      */}
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:py-5 lg:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <nav aria-label={t("footer.companyHeading")}>
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 sm:gap-x-5">
            {links.map((link) => (
              <li key={link.href}>
                {/*
                  The 44px touch target is keyed to the pointer, not to a
                  width breakpoint: an iPad at 820px is a finger, and a
                  narrow desktop window is still a mouse. (Written as an
                  arbitrary media variant because Tailwind 3.4 has no
                  pointer-* variant - that arrived in v4.) With a mouse
                  the row tightens to 28px, which is what keeps a single
                  row this link-dense from wrapping any more than it has
                  to.
                */}
                <Link
                  href={link.href}
                  className="inline-flex items-center py-1 text-[13px] leading-5 text-gray-500 transition-colors hover:text-zrp-red dark:text-gray-500 dark:hover:text-zrp-red [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:py-0"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          Language-neutral by construction - a symbol, the brand name and
          a flag - so it needs no translation key and reads the same in
          all 11 languages. The year comes from the clock rather than
          being written into the source, so this line cannot quietly go
          stale.
        */}
        <p className="mt-2.5 text-center text-[11px] leading-4 text-gray-400 dark:text-gray-500 sm:mt-3">
          © {new Date().getFullYear()} ZRP{" "}
          <span role="img" aria-label="Switzerland">
            🇨🇭
          </span>
        </p>
      </div>
    </footer>
  );
}
