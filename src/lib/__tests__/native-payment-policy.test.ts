import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  isNativeStoreRestrictedPayment,
  nativePaymentHeaders,
  NATIVE_PAYMENT_HEADER,
  NATIVE_PAYMENT_DISABLED_CODE,
} from "../native-payment-policy";
import { rejectNativePayment } from "../native-payment-policy.server";

// Regression coverage for the store-remediation policy: Tips, premium-post
// unlocks, the crypto plan-upgrade request, and Help contributions must be
// blocked when the request originates from the native iOS/Android app, and
// never blocked on web - see native-payment-policy.ts for the reasoning
// behind which features are restricted.
describe("isNativeStoreRestrictedPayment", () => {
  it("restricts tips, premium-post, plan-upgrade, and help-contribution on native", () => {
    expect(isNativeStoreRestrictedPayment("tips", true)).toBe(true);
    expect(isNativeStoreRestrictedPayment("premium-post", true)).toBe(true);
    expect(isNativeStoreRestrictedPayment("plan-upgrade", true)).toBe(true);
    expect(isNativeStoreRestrictedPayment("help-contribution", true)).toBe(true);
  });

  it("never restricts anything on web (isNative = false)", () => {
    expect(isNativeStoreRestrictedPayment("tips", false)).toBe(false);
    expect(isNativeStoreRestrictedPayment("premium-post", false)).toBe(false);
    expect(isNativeStoreRestrictedPayment("plan-upgrade", false)).toBe(false);
    expect(isNativeStoreRestrictedPayment("help-contribution", false)).toBe(false);
  });
});

describe("nativePaymentHeaders", () => {
  it("attaches the native signal header only when native", () => {
    expect(nativePaymentHeaders(true)).toEqual({ [NATIVE_PAYMENT_HEADER]: "1" });
    expect(nativePaymentHeaders(false)).toEqual({});
  });
});

describe("rejectNativePayment (server-side enforcement used by tip/premium-purchase/crypto-payment/help-contribute routes)", () => {
  it("lets a normal web request through (no native header) - money-moving routes stay usable on web", () => {
    const req = new NextRequest("https://zrp.one/api/creator/tip", { method: "POST" });
    expect(rejectNativePayment(req)).toBeNull();
  });

  it("rejects a request carrying the native signal header with 403 and a machine-readable code, no implementation details", async () => {
    const req = new NextRequest("https://zrp.one/api/creator/tip", {
      method: "POST",
      headers: { [NATIVE_PAYMENT_HEADER]: "1" },
    });
    const res = rejectNativePayment(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.code).toBe(NATIVE_PAYMENT_DISABLED_CODE);
    expect(body.error).toBeTruthy();
  });

  it("ignores the header unless it's exactly '1' - a stray/garbage value never blocks a real web request", () => {
    const req = new NextRequest("https://zrp.one/api/creator/tip", {
      method: "POST",
      headers: { [NATIVE_PAYMENT_HEADER]: "true" },
    });
    expect(rejectNativePayment(req)).toBeNull();
  });
});
