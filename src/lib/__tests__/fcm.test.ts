import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// sendFcmPush lazily initializes the Firebase Admin SDK from
// FIREBASE_SERVICE_ACCOUNT_JSON exactly once per module instance (see
// fcm.ts's initAttempted flag) - vi.resetModules() + a dynamic import
// per test gets a fresh module for each scenario, the same pattern
// rate-limit.test.ts uses for its own lazily-initialized singleton.
describe("sendFcmPush", () => {
  const originalEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    } else {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalEnv;
    }
  });

  it("is a safe no-op when FIREBASE_SERVICE_ACCOUNT_JSON is not set", async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const { sendFcmPush } = await import("../fcm");
    await expect(sendFcmPush("user-1", "Title", "Body")).resolves.toBeUndefined();
  });

  it("fails safe (does not throw) when FIREBASE_SERVICE_ACCOUNT_JSON is malformed JSON", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{not valid json";
    const { sendFcmPush } = await import("../fcm");
    await expect(sendFcmPush("user-1", "Title", "Body")).resolves.toBeUndefined();
  });

  it("fails safe when FIREBASE_SERVICE_ACCOUNT_JSON is valid JSON but not a usable service account", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ foo: "bar" });
    const { sendFcmPush } = await import("../fcm");
    await expect(sendFcmPush("user-1", "Title", "Body")).resolves.toBeUndefined();
  });
});
