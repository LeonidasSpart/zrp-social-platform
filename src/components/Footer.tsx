"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Footer() {
  const { t } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zrp-silver/30 dark:border-zrp-charcoal/50 bg-white dark:bg-zrp-deepBlack mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-10 md:gap-8">

          {/* Brand column */}
          <div className="sm:col-span-2 md:col-span-2 flex flex-col items-center sm:items-start text-center sm:text-left">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <Image
                src="/logo.png"
                alt="ZRP"
                width={40}
                height={40}
                className="w-9 h-9 object-contain"
              />
              <span className="font-orbitron font-bold text-lg text-zrp-charcoal dark:text-white">
                ZRP Social
              </span>
            </Link>

            <p className="text-sm text-zrp-charcoal/60 dark:text-white/60 font-inter max-w-xs">
              {t("footer.tagline")}
            </p>

            <div className="mt-4 inline-flex items-center gap-1.5 bg-zrp-red/10 text-zrp-red text-xs font-medium font-inter px-3 py-1.5 rounded-full">
              {t("footer.charityBadge")}
            </div>
          </div>

          {/* Company */}
          <div className="text-center sm:text-left">
            <h3 className="font-orbitron text-sm font-semibold text-zrp-charcoal dark:text-white mb-3 uppercase tracking-wide">
              {t("footer.companyHeading")}
            </h3>

            <ul className="space-y-2 text-sm font-inter">
              <li>
                <Link
                  href="/about"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.about")}
                </Link>
              </li>

              <li>
                <Link
                  href="/careers"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.careers")}
                </Link>
              </li>

              <li>
                <Link
                  href="/charity"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.charity")}
                </Link>
              </li>

              <li>
                <Link
                  href="/press"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.pressKit")}
                </Link>
              </li>

              <li>
                <Link
                  href="/news"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.zrpNews")}
                </Link>
              </li>

              <li>
                <Link
                  href="/journalist"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.becomeJournalist")}
                </Link>
              </li>

              <li>
                <Link
                  href="/investors"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.investors")}
                </Link>
              </li>

              <li>
                <Link
                  href="/contact"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.contact")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="text-center sm:text-left">
            <h3 className="font-orbitron text-sm font-semibold text-zrp-charcoal dark:text-white mb-3 uppercase tracking-wide">
              {t("footer.supportHeading")}
            </h3>

            <ul className="space-y-2 text-sm font-inter">
              <li>
                <Link
                  href="/faq"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.faq")}
                </Link>
              </li>

              <li>
                <Link
                  href="/help"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.helpCenter")}
                </Link>
              </li>

              <li>
                <Link
                  href="/contact"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.contactSupport")}
                </Link>
              </li>

              <li>
                <Link
                  href="/support/tickets"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.myTickets")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="text-center sm:text-left">
            <h3 className="font-orbitron text-sm font-semibold text-zrp-charcoal dark:text-white mb-3 uppercase tracking-wide">
              {t("footer.legalHeading")}
            </h3>

            <ul className="space-y-2 text-sm font-inter">
              <li>
                <Link
                  href="/privacy"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.privacyPolicy")}
                </Link>
              </li>

              <li>
                <Link
                  href="/terms"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  {t("footer.termsOfService")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-zrp-silver/20 dark:border-zrp-charcoal/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p className="text-xs text-zrp-charcoal/70 dark:text-white/60 font-inter">
            {t("footer.copyright", { year: String(year) })}
          </p>

          <p className="text-xs text-zrp-charcoal/70 dark:text-white/60 font-inter flex items-center gap-1.5">
            {t("footer.madeInSwitzerland")}
          </p>
        </div>
      </div>
    </footer>
  );
}
