"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Globe2, ArrowRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/*
 * The one orchestrated moment this page spends its motion budget on
 * (see the design system's "one orchestrated moment beats scattered
 * effects" rule) - a single staggered reveal on load, gated behind
 * useReducedMotion() same as every other framer-motion surface in
 * ZRP. Everything below the hero (map, explorer, levels) is static on
 * arrival; nothing here loops or re-triggers.
 */
export default function AmbassadorHero() {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const [stats, setStats] = useState<{ totalAmbassadors: number; countriesRepresented: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ambassadors/stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const fadeUp = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
      };

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-zrp-deepBlack via-zrp-charcoal to-zrp-deepBlack px-4 py-20 text-center sm:py-28">
      {/* A single, static radial glow behind the headline - depth, not
          decoration; no particles, no loop. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-zrp-red/10 blur-[120px]"
      />

      <div className="relative mx-auto max-w-3xl">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70"
        >
          <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("ambassadors.hero.badge")}
        </motion.div>

        <motion.h1
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="text-balance font-orbitron text-3xl font-extrabold leading-tight text-white sm:text-5xl"
        >
          {t("ambassadors.hero.title1")}
          <br />
          {t("ambassadors.hero.title2")}
          <br />
          <span className="text-zrp-red">{t("ambassadors.hero.title3")}</span>
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.16 }}
          className="mx-auto mt-6 max-w-xl text-base text-white/70 sm:text-lg"
        >
          {t("ambassadors.hero.subtitle")}
        </motion.p>

        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href="/ambassadors/apply"
            className="inline-flex items-center gap-2 rounded-full bg-zrp-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-zrp-darkRed"
          >
            {t("ambassadors.hero.ctaPrimary")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <a
            href="#world-map"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            {t("ambassadors.hero.ctaSecondary")}
          </a>
        </motion.div>

        {/* Real numbers only - null while loading, never a guess, and
            no fabricated growth/trend figure since ZRP has no
            historical baseline yet to compute one honestly. */}
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.32 }}
          className="mx-auto mt-12 flex max-w-md items-center justify-center gap-10 border-t border-white/10 pt-8"
        >
          <div>
            <p className="font-orbitron text-2xl font-bold tabular-nums text-white">
              {stats ? stats.totalAmbassadors.toLocaleString() : "–"}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-white/50">
              {t("ambassadors.hero.statAmbassadors")}
            </p>
          </div>
          <div className="h-8 w-px bg-white/10" aria-hidden="true" />
          <div>
            <p className="font-orbitron text-2xl font-bold tabular-nums text-white">
              {stats ? stats.countriesRepresented.toLocaleString() : "–"}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-white/50">
              {t("ambassadors.hero.statCountries")}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
