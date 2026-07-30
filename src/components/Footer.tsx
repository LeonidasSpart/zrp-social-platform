"use client";

import Link from "next/link";
import Logo from "./Logo";
import { Send, Disc, Github } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 mt-auto">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center text-center space-y-6">
          <Logo variant="full" className="mx-auto" />
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
            Launch, build, and connect on Solana.
          </p>

          <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <Link href="/about" className="hover:text-zrp-red transition">About</Link>
            <Link href="/privacy" className="hover:text-zrp-red transition">Privacy</Link>
            <Link href="/terms" className="hover:text-zrp-red transition">Terms</Link>
            <Link href="/contact" className="hover:text-zrp-red transition">Contact</Link>
            <Link href="/charity" className="hover:text-zrp-red transition">Charity</Link>
          </div>

          <div className="flex justify-center gap-4">
            <a href="https://t.me/AIZRP" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-zrp-red transition">
              <Send className="w-5 h-5" />
            </a>
            <a href="https://discord.com/invite/W4qS4xkbn" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-zrp-red transition">
              <Disc className="w-5 h-5" />
            </a>
            <a href="https://github.com/LeonidasSpart/solanalaunchpad" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-zrp-red transition">
              <Github className="w-5 h-5" />
            </a>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-500">
            Built with purpose. 35% of profits go to charity.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-600">
            &copy; {new Date().getFullYear()} ZRP. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
