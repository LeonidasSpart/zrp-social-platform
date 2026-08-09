"use client";

import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-silver/30 dark:border-charcoal/50 bg-white dark:bg-deep-black mt-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col items-center text-center space-y-4">
          {/* ─── Logo ─── */}
          <Link href="/" className="flex-shrink-0">
            <Image
              src="/logo.png"
              alt="ZRP"
              width={86}
              height={86}
              className="w-14 h-14 object-contain"
            />
          </Link>

          {/* ─── Navigation Links ─── */}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-charcoal/70 dark:text-white/70 font-inter">
            <Link href="/about" className="hover:text-zrp-red transition">About</Link>
            <Link href="/privacy" className="hover:text-zrp-red transition">Privacy</Link>
            <Link href="/terms" className="hover:text-zrp-red transition">Terms</Link>
            <Link href="/contact" className="hover:text-zrp-red transition">Contact</Link>
            <Link href="/charity" className="hover:text-zrp-red transition">Charity</Link>
            <Link href="/faq" className="hover:text-zrp-red transition">FAQ</Link>
            <Link href="/help" className="hover:text-zrp-red transition">Help</Link>
            <Link href="/press" className="hover:text-zrp-red transition">Press Kit</Link>
          </div>

          {/* ─── Copyright ─── */}
          <p className="text-xs text-charcoal/40 dark:text-white/40 font-inter">
            &copy; {new Date().getFullYear()} ZRP. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
