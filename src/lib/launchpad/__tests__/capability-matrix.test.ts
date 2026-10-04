import { describe, it, expect } from "vitest";
import {
  LAUNCHPAD_CAPABILITY_MATRIX,
  hasFullCrossPlatformParity,
  featuresRequiringExternalWebFlow,
  type LaunchpadFeature,
  type LaunchpadPlatform,
} from "../capability-matrix";

const TRANSACTION_FEATURES: LaunchpadFeature[] = [
  "tokenCreation",
  "bondingCurveBuy",
  "bondingCurveSell",
  "poolCreate",
  "addLiquidity",
  "removeLiquidity",
  "lpBurn",
];

const READ_ONLY_FEATURES: LaunchpadFeature[] = [
  "bondingCurveQuote",
  "graduationDetection",
  "discovery",
  "search",
  "tokenDetail",
  "holderData",
  "volumeAnalytics",
  "transactionHistory",
  "creatorProfile",
  "shareDeepLinks",
];

const ALL_PLATFORMS: LaunchpadPlatform[] = ["WEB", "PWA", "ANDROID", "IOS", "IPADOS"];

describe("LAUNCHPAD_CAPABILITY_MATRIX", () => {
  it("covers every declared feature for every platform with a note", () => {
    for (const feature of Object.keys(LAUNCHPAD_CAPABILITY_MATRIX) as LaunchpadFeature[]) {
      for (const platform of ALL_PLATFORMS) {
        const entry = LAUNCHPAD_CAPABILITY_MATRIX[feature][platform];
        expect(entry, `${feature}/${platform}`).toBeDefined();
        expect(entry.note.length, `${feature}/${platform} must explain its flags`).toBeGreaterThan(10);
      }
    }
  });

  it("never claims a platform's own transaction flow is both distribution-permitted and in-app for iOS/iPadOS", () => {
    for (const feature of TRANSACTION_FEATURES) {
      for (const platform of ["IOS", "IPADOS"] as const) {
        const entry = LAUNCHPAD_CAPABILITY_MATRIX[feature][platform];
        expect(entry.distributionPermitted, `${feature}/${platform}`).toBe(false);
        expect(entry.requiresExternalWebFlow, `${feature}/${platform}`).toBe(true);
        expect(entry.disabledInStoreBuild, `${feature}/${platform}`).toBe(true);
      }
    }
  });

  it("marks every transaction feature on Android as permitted only under a compliance condition, never unconditionally shipped", () => {
    for (const feature of TRANSACTION_FEATURES) {
      const entry = LAUNCHPAD_CAPABILITY_MATRIX[feature].ANDROID;
      expect(entry.distributionPermitted, feature).toBe(true);
      expect(entry.requiresComplianceConfiguration, feature).toBe(true);
    }
  });

  it("keeps web and PWA fully open for every feature with no compliance gate", () => {
    for (const feature of Object.keys(LAUNCHPAD_CAPABILITY_MATRIX) as LaunchpadFeature[]) {
      for (const platform of ["WEB", "PWA"] as const) {
        const entry = LAUNCHPAD_CAPABILITY_MATRIX[feature][platform];
        expect(entry.distributionPermitted, `${feature}/${platform}`).toBe(true);
        expect(entry.requiresComplianceConfiguration, `${feature}/${platform}`).toBe(false);
        expect(entry.disabledInStoreBuild, `${feature}/${platform}`).toBe(false);
      }
    }
  });

  it("marks every read-only feature as distribution-permitted on every native platform", () => {
    for (const feature of READ_ONLY_FEATURES) {
      for (const platform of ["ANDROID", "IOS", "IPADOS"] as const) {
        const entry = LAUNCHPAD_CAPABILITY_MATRIX[feature][platform];
        expect(entry.distributionPermitted, `${feature}/${platform}`).toBe(true);
        expect(entry.requiresExternalWebFlow, `${feature}/${platform}`).toBe(false);
      }
    }
  });
});

describe("hasFullCrossPlatformParity", () => {
  it("is false for every transaction feature today (native not yet implemented)", () => {
    for (const feature of TRANSACTION_FEATURES) {
      expect(hasFullCrossPlatformParity(feature)).toBe(false);
    }
  });

  it("is false for read-only features too until native screens are actually built, not just permitted", () => {
    for (const feature of READ_ONLY_FEATURES) {
      expect(hasFullCrossPlatformParity(feature)).toBe(false);
    }
  });
});

describe("featuresRequiringExternalWebFlow", () => {
  it("lists every transaction feature for iOS and iPadOS", () => {
    const iosFlow = featuresRequiringExternalWebFlow("IOS");
    const ipadFlow = featuresRequiringExternalWebFlow("IPADOS");
    for (const feature of TRANSACTION_FEATURES) {
      expect(iosFlow).toContain(feature);
      expect(ipadFlow).toContain(feature);
    }
  });

  it("lists nothing for web/PWA", () => {
    expect(featuresRequiringExternalWebFlow("WEB")).toEqual([]);
    expect(featuresRequiringExternalWebFlow("PWA")).toEqual([]);
  });

  it("lists nothing for Android (non-custodial in-app signing is the planned path, not a web handoff)", () => {
    expect(featuresRequiringExternalWebFlow("ANDROID")).toEqual([]);
  });
});
