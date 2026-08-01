"use client";

import Link from "next/link";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-900 px-4 text-center">
      {/* ─── ZRP Branding ─── */}
      <div className="mb-6">
        <h1 className="text-6xl font-bold text-zrp-red">404</h1>
        <div className="w-16 h-1 bg-zrp-red mx-auto mt-2 rounded-full" />
      </div>

      {/* ─── Message ─── */}
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
        Oops! Page not found.
      </h2>
      <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>

      {/* ─── Illustration ─── */}
      <div className="mt-6 text-7xl">🔍</div>

      {/* ─── Actions ─── */}
      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-zrp-red text-white rounded-full font-medium hover:bg-zrp-darkRed transition"
        >
          <Home className="w-4 h-4" />
          Go Home
        </Link>
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 px-6 py-2.5 border border-gray-300 dark:border-gray-600 rounded-full font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
      </div>

      {/* ─── Footer Links ─── */}
      <div className="mt-12 flex flex-wrap justify-center gap-4 text-sm text-gray-400 dark:text-gray-500">
        <Link href="/about" className="hover:text-zrp-red transition">About</Link>
        <Link href="/privacy" className="hover:text-zrp-red transition">Privacy</Link>
        <Link href="/terms" className="hover:text-zrp-red transition">Terms</Link>
        <Link href="/contact" className="hover:text-zrp-red transition">Contact</Link>
        <Link href="/charity" className="hover:text-zrp-red transition">Charity</Link>
      </div>

      {/* ─── Search Box (optional) ─── */}
      <div className="mt-6 w-full max-w-sm">
        <form action="/search" method="GET" className="flex items-center border border-gray-300 dark:border-gray-600 rounded-full overflow-hidden bg-white dark:bg-gray-800">
          <input
            type="text"
            name="q"
            placeholder="Search ZRP..."
            className="flex-1 px-4 py-2 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-zrp-red transition"
          >
            <Search className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
