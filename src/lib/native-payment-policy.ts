/**
 * Which crypto-payment surfaces are disabled inside the native iOS/Android
 * (Capacitor) apps, and why.
 *
 * Per the store-remediation audit: Tips and the crypto plan-upgrade flow are
 * real, automated (Tips) or admin-reviewed (plan upgrade) crypto payments
 * that unlock functionality/status, taking a platform cut - a direct match
 * for Apple guideline 3.1.1 ("Apps may not use their own mechanisms to
 * unlock content or functionality, such as... cryptocurrencies and
 * cryptocurrency wallets") and the closest verifiable analog for Google
 * Play's Payments policy (which could not be fetched live from this
 * environment - treated conservatively as a result). Premium-post purchase
 * has no reachable frontend trigger anywhere today (web included), but is
 * blocked here too as defense-in-depth on the API route itself. Help/charity
 * contributions are 0%-fee, 100%-passthrough, but ZRP's HelpCampaign is
 * organizer/cause-based rather than strictly one-individual-to-another as
 * Apple's 3.2.1(vii) gift exemption is worded - genuinely ambiguous, so
 * disabled natively too, conservatively, pending clearer guidance.
 *
 * Marketplace and creator withdrawals are NOT restricted here: Marketplace
 * never processes payment at all (price is informational, deals close
 * off-platform), and withdrawals are a creator cashing out money already
 * credited to them, not a purchase.
 */
export type NativeRestrictedPaymentFeature =
  | "tips"
  | "premium-post"
  | "plan-upgrade"
  | "help-contribution";

const NATIVE_RESTRICTED_FEATURES: ReadonlySet<NativeRestrictedPaymentFeature> = new Set<NativeRestrictedPaymentFeature>([
  "tips",
  "premium-post",
  "plan-upgrade",
  "help-contribution",
]);

// Sent by the client on requests to a store-sensitive payment endpoint so
// the server can reject them when they originate from the native app.
// This is a client-controlled signal, not proof of identity - it exists so
// the native UI can't accidentally (or be made to) reach these endpoints,
// as defense-in-depth alongside hiding the triggering UI, never as the
// sole security boundary. Real payment safety still comes entirely from
// server-side auth + independent on-chain verification, both unchanged.
export const NATIVE_PAYMENT_HEADER = "x-zrp-native-app";

export const NATIVE_PAYMENT_DISABLED_CODE = "NATIVE_PAYMENT_DISABLED";

/**
 * Client-side only. Reuses the same Capacitor.isNativePlatform() detection
 * NativeAppBridge.tsx and nativeAuth.ts already use - no second native-
 * detection mechanism.
 */
export function isNativeStoreRestrictedPayment(
  feature: NativeRestrictedPaymentFeature,
  isNative: boolean
): boolean {
  return isNative && NATIVE_RESTRICTED_FEATURES.has(feature);
}

/**
 * Client-side only. Spread into a fetch() call's headers for any request
 * that hits a store-sensitive payment endpoint, e.g.:
 *   fetch("/api/creator/tip", { headers: { ...nativePaymentHeaders(isNativeApp()) } })
 */
export function nativePaymentHeaders(isNative: boolean): Record<string, string> {
  return isNative ? { [NATIVE_PAYMENT_HEADER]: "1" } : {};
}
