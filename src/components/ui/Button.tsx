"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./styles";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /**
   * Shows a spinner and disables the control. The label stays rendered
   * rather than being swapped for the spinner, so the button keeps a
   * stable accessible name while it is working and does not change
   * width mid-action.
   */
  loading?: boolean;
}

/**
 * The one button in the ZRP web app.
 *
 * There was no shared button before this: the same red primary action
 * was written out by hand at every call site, which is why it currently
 * appears with four different corner radii and why its label fails
 * contrast in the majority spelling (see styles.ts for the numbers).
 *
 * Only four variants exist on purpose. Red is the product's single
 * primary-action colour, so a screen should carry one `primary` button;
 * anything else that needs to be pressable is `secondary` or `quiet`.
 *
 * For a link that should look like a button, use `buttonClasses()` on a
 * `next/link` rather than nesting an anchor in a button.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, loading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

export default Button;
