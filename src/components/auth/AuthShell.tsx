"use client";

import { useLanguage } from "@/contexts/LanguageContext";

/**
 * The shell every authentication screen sits in - and, because
 * middleware.ts does not list "/" as a public path, the first thing a
 * brand-new visitor to zrp.one actually sees.
 *
 * Two problems it exists to solve:
 *
 * 1. Login and signup each carried their own byte-for-byte copy of the
 *    desktop brand panel and the mobile hero. Two copies of the same
 *    block drift; one component cannot.
 *
 * 2. Neither copy told a visitor anything about ZRP. On desktop the
 *    panel was a gradient with a dot pattern and a headline; on mobile
 *    (where social traffic actually is) it was cut entirely, so the
 *    first screen was a bare sign-in form with no product story at all.
 *
 * Every string here already exists in src/lib/translations.ts and is
 * already translated into all 11 supported languages - no new keys, no
 * invented marketing copy, and nothing that isn't already published on
 * the About page.
 */

type ValueItem = {
  title: string;
  description: string;
};

/**
 * The three ZRP values, as a numbered index rather than a card grid.
 *
 * Cards would read as the generic "hero + three feature boxes" landing
 * page that every product ships; a numbered index with hairline rules is
 * International Typographic Style, which is both distinctly ZRP (Swiss
 * platform, Swiss design lineage) and something no major social network
 * uses as its visual signature.
 */
function ValueIndex({
  items,
  tone,
}: {
  items: ValueItem[];
  tone: "onBrand" | "onSurface";
}) {
  const onBrand = tone === "onBrand";

  return (
    <ol
      className={`border-t ${
        onBrand ? "border-white/25" : "border-gray-200 dark:border-gray-800"
      }`}
    >
      {items.map((item, index) => (
        <li
          key={item.title}
          className={`flex gap-4 border-b py-4 sm:gap-5 sm:py-5 ${
            onBrand ? "border-white/25" : "border-gray-200 dark:border-gray-800"
          }`}
        >
          {/* The <ol> already conveys order to assistive tech, so the
              visible numeral is presentational only. */}
          <span
            aria-hidden="true"
            className={`shrink-0 pt-0.5 font-orbitron text-sm tabular-nums ${
              onBrand ? "text-white/70" : "text-zrp-red"
            }`}
          >
            {String(index + 1).padStart(2, "0")}
          </span>

          <div className="min-w-0">
            <h3
              className={`font-orbitron text-base font-bold leading-tight sm:text-lg ${
                onBrand ? "text-white" : "text-gray-900 dark:text-white"
              }`}
            >
              {item.title}
            </h3>
            <p
              className={`mt-1 text-sm leading-relaxed ${
                onBrand ? "text-white/80" : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {item.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function AuthShell({
  heading,
  subheading,
  children,
}: {
  /** Short heading for the form column, e.g. "Sign in". */
  heading: string;
  /**
   * Optional supporting line under the heading. Omitted on signup,
   * where the only sensible line was the same sentence the brand panel
   * already sets as its headline a few hundred pixels to the left.
   */
  subheading?: string;
  /** The form itself. */
  children: React.ReactNode;
}) {
  const { t } = useLanguage();

  const values: ValueItem[] = [
    { title: t("about.value1Title"), description: t("about.value1Desc") },
    { title: t("about.value2Title"), description: t("about.value2Desc") },
    { title: t("about.value3Title"), description: t("about.value3Desc") },
  ];

  return (
    // Height is deliberately natural on mobile and only filled at lg:.
    // The app shell in layout.tsx pads
    // pb-[calc(3.5rem+env(safe-area-inset-bottom))] unconditionally for
    // BottomNav, which never renders for a signed-out visitor - so
    // forcing min-h-screen here (as both pages previously did) pushed
    // the page past the viewport and produced a scrollbar with nothing
    // below the fold. At lg: that padding is already zero.
    <div className="flex w-full flex-col lg:min-h-[calc(100dvh-64px)] lg:flex-row">
      {/* ─── Brand panel · lg and up ──────────────────────────────────
          No logo here: Header renders on every route, signed in or not,
          and already shows the ZRP mark. The previous version repeated
          it a second time a few hundred pixels below the first. */}
      <aside className="relative hidden overflow-hidden bg-zrp-darkRed lg:flex lg:w-[46%] xl:w-1/2">
        {/* A fine vertical rule field, not a gradient or a dot pattern.
            Structure rather than decoration - it reads as a grid the
            content is set on. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, #fff 0 1px, transparent 1px 96px)",
          }}
        />

        {/*
          Optically centred as a single composition rather than
          justify-between across the full column height. Stretching the
          eyebrow, headline and value index to the top, middle and
          bottom edges left enormous dead gaps on a tall viewport and
          pushed the last value down under the fixed CookieConsent bar.
        */}
        <div className="relative z-10 flex w-full flex-col justify-center p-12 xl:p-16">
          <p className="font-orbitron text-xs uppercase tracking-[0.25em] text-white/70">
            {t("auth.welcomeTitle")}
          </p>

          <h2 className="mt-8 max-w-xl font-orbitron text-4xl font-bold leading-[1.08] text-white xl:text-5xl">
            {t("about.subtitle")}
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/80">
            {t("about.ctaText")}
          </p>

          <div className="mt-12 max-w-md">
            <ValueIndex items={values} tone="onBrand" />
          </div>
        </div>
      </aside>

      {/* ─── Form column ─────────────────────────────────────────────── */}
      <div className="flex flex-1 justify-center px-4 py-10 sm:px-6 sm:py-14 lg:items-center lg:py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 sm:mb-10">
            {/* The eyebrow only appears where the brand panel doesn't,
                so the brand name is stated exactly once per viewport. */}
            <p className="font-orbitron text-xs uppercase tracking-[0.25em] text-zrp-red lg:hidden">
              {t("auth.welcomeTitle")}
            </p>

            <h1 className="mt-3 font-orbitron text-3xl font-bold leading-[1.1] text-gray-900 dark:text-white sm:text-4xl lg:mt-0 lg:text-3xl">
              {heading}
            </h1>
            {subheading && (
              <p className="mt-2 text-base leading-relaxed text-gray-600 dark:text-gray-400">
                {subheading}
              </p>
            )}
          </div>

          {children}

          {/* ─── Mobile / tablet story ──────────────────────────────────
              The desktop panel is the only place ZRP explained itself,
              and it was hidden below lg. Repeating it here - after the
              form, so a returning user still lands straight on sign-in -
              means a first-time visitor on a phone finally gets the same
              answer to "what is this?" that a desktop visitor gets. */}
          <section className="mt-14 lg:hidden" aria-labelledby="zrp-values-heading">
            {/* Deliberately the same three blocks, in the same order, as
                the desktop panel - headline, supporting line, value
                index - so the two layouts read as one design rather
                than two. Set as a real heading rather than a
                wide-tracked uppercase label, which at this size wrapped
                to two lines and was hard to read. */}
            <h2
              id="zrp-values-heading"
              className="font-orbitron text-xl font-bold leading-tight text-gray-900 dark:text-white sm:text-2xl"
            >
              {t("about.subtitle")}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-gray-600 dark:text-gray-400">
              {t("about.ctaText")}
            </p>
            <div className="mt-8">
              <ValueIndex items={values} tone="onSurface" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
