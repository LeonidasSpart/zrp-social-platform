/**
 * Class resolvers for the ZRP UI primitives.
 *
 * These live apart from the components so the variant logic is a pure
 * function that can be unit-tested: vitest runs here with
 * `environment: "node"` and `include: ["src/**\/*.test.ts"]`, so a
 * `.tsx` component render is not testable without adding jsdom and a
 * testing library. Keeping the decisions in plain TypeScript means the
 * part that actually encodes design rules is covered, with no new
 * dependency.
 */

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Shared by every variant.
 *
 * `rounded-full` is the radius the design direction assigns to primary
 * actions and pills, and it is already the codebase's majority (650
 * uses against 452 `rounded-lg` and 361 `rounded-xl`) - this settles
 * which one a button uses rather than leaving it to each call site,
 * where the same red button is currently drawn four different ways.
 *
 * The focus ring is stated here rather than inherited: globals.css
 * gives `button:focus-visible` a red outline, and a filled red button
 * needs an offset ring so the indicator is visible against its own
 * fill.
 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold " +
  "whitespace-nowrap transition select-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zrp-red focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-white dark:focus-visible:ring-offset-zrp-deepBlack " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Sizes are set by vertical padding plus a minimum height, not by
 * height alone, so a button still grows for a long translated label
 * (German and Russian run ~30% longer). `min-h` keeps every size at or
 * above the 44px touch minimum except `sm`, which is for dense inline
 * rows where the surrounding row supplies the target.
 */
const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-3.5 py-1.5 text-sm",
  md: "min-h-[44px] px-5 py-2.5 text-sm",
  lg: "min-h-[48px] px-6 py-3 text-base",
};

/**
 * Primary is `zrp-darkRed`, not `zrp-red`, and that is a correction.
 *
 * White on #FF2D2D (zrp-red) is 3.71:1 - it fails WCAG AA for normal
 * text - yet `bg-zrp-red text-white` is the dominant primary button in
 * the codebase today. White on #B10000 (zrp-darkRed) is 7.32:1 and
 * passes comfortably, in both themes, because the label's contrast is
 * against the button's own fill rather than the page.
 *
 * Hover lifts to the brighter brand red: a hover state is transient and
 * is not held long enough to read a label against, so the brand's most
 * saturated colour is spent on the interaction rather than the resting
 * state. In dark mode the resting fill also carries a hairline, because
 * #B10000 against #050505 is only 2.78:1 as a shape and needs an edge
 * to read as a control.
 */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-zrp-darkRed text-white shadow-sm hover:bg-zrp-red " +
    "dark:ring-1 dark:ring-inset dark:ring-white/15",
  secondary:
    "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 " +
    "dark:border-gray-700 dark:bg-white/5 dark:text-gray-100 dark:hover:bg-white/10",
  quiet:
    "text-gray-700 hover:bg-gray-100 hover:text-gray-900 " +
    "dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white",
  destructive:
    "border border-red-300 bg-white text-red-700 hover:bg-red-50 " +
    "dark:border-red-900 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40",
};

export function buttonClasses(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}): string {
  const variant = opts?.variant ?? "primary";
  const size = opts?.size ?? "md";
  return [
    BUTTON_BASE,
    BUTTON_SIZE[size],
    BUTTON_VARIANT[variant],
    opts?.fullWidth ? "w-full" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Field.
 *
 * One control shape for text inputs, so two fields stacked in the same
 * form can never disagree on height or radius - the most common drift
 * in this codebase. `rounded-xl` is the direction's container radius;
 * `py-3` keeps the control at a 44px touch target.
 */
export const FIELD_CONTROL_CLASS =
  "w-full rounded-xl border bg-white px-4 py-3 text-base text-gray-900 transition " +
  "placeholder:text-gray-500 " +
  "focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zrp-red " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400";

/**
 * Invalid state is carried by the border, not by tinting the fill:
 * a red-washed input reads as "selected" as often as "wrong", and the
 * message beneath it is what actually explains the problem.
 */
export const FIELD_BORDER_CLASS = "border-gray-300 dark:border-gray-600";
export const FIELD_BORDER_INVALID_CLASS = "border-red-500 dark:border-red-500";

export function fieldControlClasses(invalid?: boolean): string {
  return [
    FIELD_CONTROL_CLASS,
    invalid ? FIELD_BORDER_INVALID_CLASS : FIELD_BORDER_CLASS,
  ].join(" ");
}
