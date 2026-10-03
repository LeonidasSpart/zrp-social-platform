/**
 * The single source of truth for which ZRP Launchpad features are
 * implemented, technically feasible, and legally/contractually
 * distributable on each platform - the explicit "platform-capability
 * architecture" called for instead of silently hiding or faking features
 * where a store's distribution rules block them.
 *
 * This is NOT a guess. Every `distributionPermitted: false` /
 * `requiresComplianceConfiguration: true` below is grounded in the actual
 * current policy text (checked via live web search, not training-data
 * recall - policies in this space move fast and have moved since any
 * model's cutoff):
 *
 * - Apple App Store Review Guideline 3.1.1 ("Apps may not use their own
 *   mechanisms to unlock content or functionality, such as... crypto-
 *   currencies and cryptocurrency wallets") - already the basis for
 *   disabling tips/premium-posts/plan-upgrade/help-contribution natively,
 *   see src/lib/native-payment-policy.ts. A ZRP token CREATE transaction
 *   (minting a new asset via the app's own on-chain mechanism) falls
 *   squarely under this guideline on iOS.
 * - Apple App Store Review Guideline 3.1.5(iii) ("Exchanges: Apps may
 *   facilitate transactions or transmissions of cryptocurrency on an
 *   approved exchange, provided they are offered only in countries or
 *   regions where the app has appropriate licensing and permissions to
 *   provide a cryptocurrency exchange" - requires documentary evidence of
 *   licensing/AML/KYC submitted to Apple). A bonding-curve BUY/SELL is an
 *   exchange mechanism; ZRP holds no cryptocurrency exchange license in
 *   any jurisdiction. This blocks native iOS trading entirely, independent
 *   of 3.1.1 - it is a licensing/legal gap, not something code can satisfy.
 * - Google Play's Cryptocurrency Exchanges and Software Wallets Policy
 *   (updated 2025-08-13, enforced from 2025-10-29): CUSTODIAL crypto
 *   wallet/exchange apps need government licensing (US: money
 *   transmitter/MSB; EU: CASP registration). NON-CUSTODIAL apps - where
 *   the app never holds private keys and a separate wallet app performs
 *   signing - are explicitly exempt. ZRP's planned architecture (client
 *   builds the transaction, an external wallet app signs via Solana
 *   Mobile Wallet Adapter, server verifies the resulting on-chain tx) is
 *   the non-custodial pattern, the same one real Play Store apps (Phantom,
 *   Jupiter Mobile, Magic Eden) ship real on-chain trading under today.
 *   This makes Android plausibly viable for real trading where iOS is not
 *   - but ZRP must still file the Play Console financial-features
 *   declaration ("if your app sells or enables users to earn tokenized
 *   digital assets, you must declare this") - a compliance action for a
 *   human, not something this file or any code change can satisfy.
 *
 * Re-verify this file's premises against current policy text before any
 * store submission - this is a fast-moving area and the citations above
 * have a checked-on date, not a permanent one.
 *
 * Last verified: see git blame on this file's introduction.
 */

export type LaunchpadPlatform = "WEB" | "PWA" | "ANDROID" | "IOS" | "IPADOS";

export interface CapabilityEntry {
  /** Does working code for this feature exist on this platform today? */
  implemented: boolean;
  /** Is it possible to build this at all given the platform's technical constraints (e.g. no first-party non-custodial wallet-signing SDK)? */
  technicallySupported: boolean;
  /** Can this be shipped inside the platform's store-distributed binary under current Apple/Google policy? */
  distributionPermitted: boolean;
  /** Must this feature hand off to the web/PWA experience instead of completing in-app? */
  requiresExternalWebFlow: boolean;
  /** Does shipping this require a compliance action ZRP must take (licensing, store declaration, legal review) before it can go live, independent of code? */
  requiresComplianceConfiguration: boolean;
  /** Is this feature deliberately disabled in the store-distributed build even though the code could technically support it? */
  disabledInStoreBuild: boolean;
  /** One-line citation/reasoning for this cell - never leave a restrictive flag unexplained. */
  note: string;
}

export type LaunchpadFeature =
  | "tokenCreation"
  | "bondingCurveBuy"
  | "bondingCurveSell"
  | "bondingCurveQuote"
  | "graduationDetection"
  | "poolCreate"
  | "addLiquidity"
  | "removeLiquidity"
  | "lpBurn"
  | "discovery"
  | "search"
  | "tokenDetail"
  | "holderData"
  | "volumeAnalytics"
  | "transactionHistory"
  | "creatorProfile"
  | "walletConnection"
  | "shareDeepLinks";

type PlatformCapabilities = Record<LaunchpadPlatform, CapabilityEntry>;

const FULL_WEB: CapabilityEntry = {
  implemented: true,
  technicallySupported: true,
  distributionPermitted: true,
  requiresExternalWebFlow: false,
  requiresComplianceConfiguration: false,
  disabledInStoreBuild: false,
  note: "Web/PWA are not App Store/Play Store distributed binaries - Apple 3.1.1/3.1.5 and Google's wallet policy govern native app store submissions, not browser-delivered web apps.",
};

const READ_ONLY_NATIVE_OK: CapabilityEntry = {
  implemented: false,
  technicallySupported: true,
  distributionPermitted: true,
  requiresExternalWebFlow: false,
  requiresComplianceConfiguration: false,
  disabledInStoreBuild: false,
  note: "Read-only display of server-authoritative data; no crypto transaction is unlocked or facilitated, so neither 3.1.1 nor 3.1.5 nor Google's exchange/wallet policy applies.",
};

const IOS_TRANSACTION_BLOCKED: CapabilityEntry = {
  implemented: false,
  technicallySupported: true,
  distributionPermitted: false,
  requiresExternalWebFlow: true,
  requiresComplianceConfiguration: true,
  disabledInStoreBuild: true,
  note: "Blocked by Apple 3.1.1 (crypto-unlock-via-own-mechanism) and 3.1.5(iii) (exchange licensing ZRP does not hold). Hand off to web/PWA via deep link; do not build in-app signing for this on iOS.",
};

const ANDROID_TRANSACTION_CONDITIONAL: CapabilityEntry = {
  implemented: false,
  technicallySupported: true,
  distributionPermitted: true,
  requiresExternalWebFlow: false,
  requiresComplianceConfiguration: true,
  disabledInStoreBuild: false,
  note: "Permitted IF built non-custodially via Solana Mobile Wallet Adapter (app never holds keys) AND ZRP files the Play Console financial-features declaration first. Ship the MWA-signed flow only after that filing is confirmed, not before.",
};

function platformRow(web: CapabilityEntry, native: CapabilityEntry): PlatformCapabilities {
  return { WEB: web, PWA: web, ANDROID: native, IOS: native, IPADOS: native };
}

function transactionRow(): PlatformCapabilities {
  return {
    WEB: FULL_WEB,
    PWA: FULL_WEB,
    ANDROID: ANDROID_TRANSACTION_CONDITIONAL,
    IOS: IOS_TRANSACTION_BLOCKED,
    IPADOS: IOS_TRANSACTION_BLOCKED,
  };
}

export const LAUNCHPAD_CAPABILITY_MATRIX: Record<LaunchpadFeature, PlatformCapabilities> = {
  tokenCreation: transactionRow(),
  bondingCurveBuy: transactionRow(),
  bondingCurveSell: transactionRow(),
  poolCreate: transactionRow(),
  addLiquidity: transactionRow(),
  removeLiquidity: transactionRow(),
  lpBurn: transactionRow(),

  // Quotes and graduation detection are pure reads (no signing, no
  // unlocking) - safe to compute/display natively everywhere, same
  // reasoning as discovery/analytics below.
  bondingCurveQuote: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),
  graduationDetection: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),

  discovery: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),
  search: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),
  tokenDetail: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),
  holderData: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),
  volumeAnalytics: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),
  transactionHistory: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),
  creatorProfile: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),
  shareDeepLinks: platformRow(FULL_WEB, READ_ONLY_NATIVE_OK),

  // Wallet connection itself (establishing a non-custodial link, no
  // transaction yet) is not a 3.1.1/3.1.5 concern on either native
  // platform - only the transaction that follows is gated. Native apps
  // need this wired regardless, to attribute a connected wallet to deep
  // links and read-only portfolio views.
  walletConnection: {
    WEB: FULL_WEB,
    PWA: FULL_WEB,
    ANDROID: { ...READ_ONLY_NATIVE_OK, note: "Connecting a non-custodial wallet (no signing yet) is not restricted by either store's policy; required groundwork for both read-only portfolio views and the MWA-signed trading flow." },
    IOS: { ...READ_ONLY_NATIVE_OK, note: "Connecting a wallet for read-only portfolio/holdings display is fine under 3.1.1 - only the subsequent unlock-via-crypto transaction is blocked, not the connection itself." },
    IPADOS: { ...READ_ONLY_NATIVE_OK, note: "Same as iOS." },
  },
};

/** True only when every platform's entry for a feature is fully live (implemented, not store-disabled). Used by dashboards/tests asserting real cross-platform parity rather than trusting a hand-written claim. */
export function hasFullCrossPlatformParity(feature: LaunchpadFeature): boolean {
  const row = LAUNCHPAD_CAPABILITY_MATRIX[feature];
  return (Object.keys(row) as LaunchpadPlatform[]).every((p) => row[p].implemented && !row[p].disabledInStoreBuild);
}

/** The set of features a native (ANDROID/IOS/IPADOS) build must deep-link to the web/PWA experience for, given today's policy. */
export function featuresRequiringExternalWebFlow(platform: LaunchpadPlatform): LaunchpadFeature[] {
  return (Object.keys(LAUNCHPAD_CAPABILITY_MATRIX) as LaunchpadFeature[]).filter(
    (f) => LAUNCHPAD_CAPABILITY_MATRIX[f][platform].requiresExternalWebFlow
  );
}
