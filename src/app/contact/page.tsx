"use client";

import Image from "next/image";
import Link from "next/link";

export default function ContactPage() {
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
        <h1 className="text-4xl md:text-5xl font-orbitron font-bold text-zrp-red">
          Contact Us
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mt-3">
          We'd love to hear from you.
        </p>
      </div>

      {/* ─── Contact options ─── */}
      <div className="space-y-6">
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white mb-2">
            General support
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
            Questions about your account, billing, or anything else — reach out and we'll get back to you.
          </p>
          <a
            href="mailto:support@zrp.one"
            className="text-zrp-red hover:underline font-medium"
          >
            support@zrp.one
          </a>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Report an issue
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
            Found a bug, a security concern, or content that violates our guidelines?
          </p>
          <a
            href="mailto:security@zrp.one"
            className="text-zrp-red hover:underline font-medium"
          >
            security@zrp.one
          </a>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white mb-2">
            More help
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Check our{" "}
            <Link href="/faq" className="text-zrp-red hover:underline">
              FAQ
            </Link>{" "}
            or{" "}
            <Link href="/help" className="text-zrp-red hover:underline">
              Help Center
            </Link>{" "}
            for quick answers.
          </p>
        </div>
      </div>
    </div>
  );
}
