"use client";

import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        className="zrp-page-shell flex-1 w-full max-w-full min-h-0 h-full overflow-hidden"
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );
}
