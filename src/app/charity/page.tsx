"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";

export default function CharityPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 md:py-20 text-gray-800 dark:text-gray-200">
      {/* ─── Header ─── */}
      <div className="text-center mb-10">
        <div className="flex justify-center mb-6">
          <Image
            src="/logo.png"
            alt="ZRP"
            width={80}
            height={80}
            className="w-20 h-20 object-contain"
          />
        </div>
        <h1 className="text-4xl md:text-5xl font-orbitron font-bold text-zrp-red flex items-center justify-center gap-3">
          <Heart className="w-9 h-9 text-zrp-red" />
          Giving Back
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mt-3">
          A portion of every tip on ZRP goes toward causes that matter.
        </p>
      </div>

      {/* ─── Explanation ─── */}
      <div className="prose prose-lg dark:prose-invert max-w-none space-y-6 text-gray-800 dark:text-gray-200">
        <p>
          When you send a tip to a creator on ZRP, a small platform fee is applied. A share of that fee —{" "}
          <strong className="text-gray-900 dark:text-white">35%</strong> — is set aside and directed to
          charitable causes, rather than kept entirely as revenue.
        </p>
        <p>
          We believe a platform built around free expression should also give something back to the
          communities that support it. This is one small way we try to do that.
        </p>
      </div>

      {/* ─── CTA ─── */}
      <div className="mt-10 pt-8 border-t border-gray-200 dark:border-gray-700 text-center">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Have a cause you'd like us to consider supporting?
        </p>
        <Link
          href="/contact"
          className="inline-block bg-zrp-red text-white px-6 py-2 rounded-full font-medium hover:bg-zrp-darkRed transition"
        >
          Get in touch
        </Link>
      </div>
    </div>
  );
}
