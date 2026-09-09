"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Button from "./Button";

export interface EmptyStateAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  primaryAction?: EmptyStateAction;
  secondaryActions?: EmptyStateAction[];
  className?: string;
}

/**
 * One empty/error state for the whole web app.
 *
 * Twenty-four files currently write their own, and the results are
 * visibly unrelated: Home's empty feed has a tinted glyph, a title, a
 * supporting line and a retry action, while Explore - one click away -
 * has a small grey icon and a single grey sentence floating in an empty
 * column. Same product, same state, two designs.
 *
 * This is the shape the native app already uses (ZrpEmptyState.kt), so
 * the two frontends answer an empty screen the same way.
 *
 * Actions are real navigation or a real retry only. An empty state must
 * never offer a control that implies a capability the product does not
 * have.
 */
export default function EmptyState({
  icon: Icon,
  title,
  body,
  primaryAction,
  secondaryActions = [],
  className,
}: EmptyStateProps) {
  const hasActions = Boolean(primaryAction) || secondaryActions.length > 0;

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center px-6 py-12 text-center sm:py-16",
        className,
      )}
    >
      {/* The glyph is decorative - the title says the same thing in
          words, so announcing it twice adds nothing. */}
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-zrp-red/10"
      >
        <Icon className="h-7 w-7 text-zrp-red" />
      </div>

      <h2 className="mt-5 font-orbitron text-lg font-bold text-gray-900 dark:text-white">
        {title}
      </h2>

      {body && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {body}
        </p>
      )}

      {hasActions && (
        // Wraps rather than shrinking: three actions must not clip at
        // 320px, and a long translated label must not squeeze its
        // neighbours.
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {primaryAction && (
            <Button size="sm" onClick={primaryAction.onClick}>
              {primaryAction.icon && (
                <primaryAction.icon className="h-4 w-4" aria-hidden="true" />
              )}
              {primaryAction.label}
            </Button>
          )}
          {secondaryActions.map((action) => (
            <Button
              key={action.label}
              variant="secondary"
              size="sm"
              onClick={action.onClick}
            >
              {action.icon && <action.icon className="h-4 w-4" aria-hidden="true" />}
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
