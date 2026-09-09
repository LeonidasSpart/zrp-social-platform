"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  /** Optional glyph before the title. Decorative - the title carries the meaning. */
  icon?: LucideIcon;
  /**
   * Back affordance. Omit it on a top-level destination reached from
   * the sidebar or bottom nav: Explore currently shows a back arrow
   * with nowhere to go back to, which is the bug this default avoids.
   * `true` uses router.back(); pass a function for an explicit target.
   */
  back?: boolean | (() => void);
  /** Accessible label for the back control. Must be translated by the caller. */
  backLabel?: string;
  /** Right-aligned slot: a count, a filter, an action. */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * One page header for the web app.
 *
 * There is no shared header today, so each screen invents one and they
 * disagree in ways a user can see: Settings offers "← Back to profile"
 * as a red text link, Explore offers an icon arrow, and Home offers no
 * header at all. This settles the pattern - one back affordance, one
 * title treatment, one place for trailing meta.
 *
 * The title is the page's `h1`. Several pages currently render none,
 * so a screen reader gets no document heading at all; passing the title
 * through here fixes that as a side effect of adopting it.
 */
export default function PageHeader({
  title,
  icon: Icon,
  back,
  backLabel,
  trailing,
  className,
}: PageHeaderProps) {
  const router = useRouter();
  const onBack = typeof back === "function" ? back : () => router.back();

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800",
        className,
      )}
    >
      {back && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel ?? "Back"}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {Icon && (
        <Icon className="h-5 w-5 shrink-0 text-zrp-red" aria-hidden="true" />
      )}

      {/* min-w-0 + truncate so a long or long-translated title
          ellipsizes instead of pushing the trailing slot off the edge -
          the same eviction pattern already fixed nine times on native. */}
      <h1 className="min-w-0 flex-1 truncate font-orbitron text-xl font-bold text-gray-900 dark:text-white">
        {title}
      </h1>

      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
