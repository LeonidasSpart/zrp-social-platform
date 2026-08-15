"use client";

import Link from "next/link";
import Image from "next/image";

export default function Footer() {
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
              The first Swiss European social media platform. Free speech, privacy, and security built for the people.
            </p>

            <div className="mt-4 inline-flex items-center gap-1.5 bg-zrp-red/10 text-zrp-red text-xs font-medium font-inter px-3 py-1.5 rounded-full">
              🧡 35% of profits go to charity
            </div>
          </div>

          {/* Company */}
          <div className="text-center sm:text-left">
            <h3 className="font-orbitron text-sm font-semibold text-zrp-charcoal dark:text-white mb-3 uppercase tracking-wide">
              Company
            </h3>

            <ul className="space-y-2 text-sm font-inter">
              <li>
                <Link
                  href="/about"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  About
                </Link>
              </li>

              <li>
                <Link
                  href="/careers"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  Careers
                </Link>
              </li>

              <li>
                <Link
                  href="/charity"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  Charity
                </Link>
              </li>

              <li>
                <Link
                  href="/press"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  Press Kit
                </Link>
              </li>

              <li>
                <Link
                  href="/investors"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  Investors
                </Link>
              </li>

              <li>
                <Link
                  href="/contact"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="text-center sm:text-left">
            <h3 className="font-orbitron text-sm font-semibold text-zrp-charcoal dark:text-white mb-3 uppercase tracking-wide">
              Support
            </h3>

            <ul className="space-y-2 text-sm font-inter">
              <li>
                <Link
                  href="/faq"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  FAQ
                </Link>
              </li>

              <li>
                <Link
                  href="/help"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  Help Center
                </Link>
              </li>

              <li>
                <Link
                  href="/contact"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  Contact Support
                </Link>
              </li>

              <li>
                <Link
                  href="/support/tickets"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  My Tickets
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="text-center sm:text-left">
            <h3 className="font-orbitron text-sm font-semibold text-zrp-charcoal dark:text-white mb-3 uppercase tracking-wide">
              Legal
            </h3>

            <ul className="space-y-2 text-sm font-inter">
              <li>
                <Link
                  href="/privacy"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  Privacy Policy
                </Link>
              </li>

              <li>
                <Link
                  href="/terms"
                  className="text-zrp-charcoal/70 dark:text-white/70 hover:text-zrp-red transition"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-zrp-silver/20 dark:border-zrp-charcoal/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <p className="text-xs text-zrp-charcoal/40 dark:text-white/40 font-inter">
            &copy; {year} ZRP. All rights reserved.
          </p>

          <p className="text-xs text-zrp-charcoal/40 dark:text-white/40 font-inter flex items-center gap-1.5">
            🇨🇭 Made in Switzerland
          </p>
        </div>
      </div>
    </footer>
  );
}
