import { describe, it, expect } from "vitest";
import { ambassadorEntryHref, ambassadorEntryLabelKey, canApplyWithStatus } from "../entry";

// Regression: an APPROVED (or PENDING/SUSPENDED) ambassador was still
// offered the "Become a ZRP Ambassador" application form from the
// /ambassadors landing page - every entry point must route off the
// real profile status, exactly mirroring what POST /api/ambassadors/
// apply accepts (never applied or REJECTED) vs refuses with 409.
describe("ambassador entry points (status-aware)", () => {
  it("never applied / REJECTED may apply and are sent to the form", () => {
    expect(canApplyWithStatus(null)).toBe(true);
    expect(canApplyWithStatus(undefined)).toBe(true);
    expect(canApplyWithStatus("REJECTED")).toBe(true);
    expect(ambassadorEntryHref(null)).toBe("/ambassadors/apply");
    expect(ambassadorEntryHref("REJECTED", "NG")).toBe("/ambassadors/apply?country=NG");
    expect(ambassadorEntryLabelKey(null, "ambassadors.hero.ctaPrimary")).toBe("ambassadors.hero.ctaPrimary");
    expect(ambassadorEntryLabelKey("REJECTED", "ambassadors.map.becomeCta")).toBe("ambassadors.map.becomeCta");
  });

  it("PENDING is sent to the dashboard with the pending label, never the form", () => {
    expect(canApplyWithStatus("PENDING")).toBe(false);
    expect(ambassadorEntryHref("PENDING")).toBe("/ambassadors/dashboard");
    expect(ambassadorEntryHref("PENDING", "DE")).toBe("/ambassadors/dashboard");
    expect(ambassadorEntryLabelKey("PENDING", "ambassadors.hero.ctaPrimary")).toBe("ambassadors.dashboard.pendingTitle");
  });

  it("APPROVED and SUSPENDED are sent to the dashboard, never the form", () => {
    for (const status of ["APPROVED", "SUSPENDED"] as const) {
      expect(canApplyWithStatus(status)).toBe(false);
      expect(ambassadorEntryHref(status)).toBe("/ambassadors/dashboard");
      expect(ambassadorEntryHref(status, "DE")).toBe("/ambassadors/dashboard");
      expect(ambassadorEntryLabelKey(status, "ambassadors.hero.ctaPrimary")).toBe("ambassadors.dashboard.title");
    }
  });
});
