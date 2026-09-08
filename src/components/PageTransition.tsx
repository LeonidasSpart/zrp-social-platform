"use client";

import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Users who have asked their OS for less motion still get the route
  // change - they just don't get the 10px slide and fade on every
  // navigation, which is exactly the kind of repeated, unrequested
  // movement the setting exists to suppress.
  const reduceMotion = useReducedMotion();

  return (
    // mode="wait" forced the outgoing page's exit animation to fully
    // finish before the incoming page's enter animation even started -
    // every navigation paid the exit and enter durations sequentially
    // (roughly 500ms total) rather than concurrently, which is exactly
    // what "the platform feels slow moving between sections" describes.
    // "sync" (the default) runs both at the same time instead, cutting
    // that overhead roughly in half without removing the transition
    // effect itself.
    <AnimatePresence mode="sync">
      {/*
        This was <motion.main>, nested inside the <main> that
        layout.tsx already renders around it - two main landmarks on
        every page, which is invalid and leaves screen-reader users
        with an ambiguous "skip to main content" target. The outer
        <main> in layout.tsx is the real one; this only ever needed to
        be a positioning/animation wrapper.
      */}
      <motion.div
        key={pathname}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
        transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeInOut" }}
        className="flex-1 w-full max-w-full min-h-0 h-full overflow-hidden"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
