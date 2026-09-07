import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../db";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// firebase-admin itself is mocked at the module level (fcm.ts imports it
// statically, like google-auth-library in api/mobile/auth/google) rather
// than mocking network calls - real firebase-admin performs real OAuth2
// token signing against the service account's private key, which has no
// business running in a unit test. `cert` reproduces just enough of the
// real validation (project_id/client_email/private_key required) that
// the "not a usable service account" test below still means what it says
// rather than trivially passing because everything is mocked away.
const { getMessaging, sendEachForMulticast, initializeApp, getApps, cert } = vi.hoisted(() => {
  const sendEachForMulticast = vi.fn(async () => ({ responses: [] as { success: boolean; error?: { code?: string } }[] }));
  const getMessaging = vi.fn(() => ({ sendEachForMulticast }));
  const initializeApp = vi.fn((_options: unknown) => ({}));
  const getApps = vi.fn(() => [] as unknown[]);
  const cert = vi.fn((serviceAccount: Record<string, unknown> | undefined) => {
    if (
      typeof serviceAccount?.project_id !== "string" ||
      typeof serviceAccount?.client_email !== "string" ||
      typeof serviceAccount?.private_key !== "string"
    ) {
      throw new Error('Service account object must contain a string "private_key" property.');
    }
    return serviceAccount;
  });
  return { getMessaging, sendEachForMulticast, initializeApp, getApps, cert };
});

vi.mock("firebase-admin/app", () => ({ initializeApp, getApps, cert }));
vi.mock("firebase-admin/messaging", () => ({ getMessaging }));

const VALID_SERVICE_ACCOUNT = {
  project_id: "zrp-test",
  client_email: "test@zrp-test.iam.gserviceaccount.com",
  private_key: "fake-key-not-real-pem",
};

// sendFcmPush lazily initializes the Firebase Admin SDK from
// FIREBASE_SERVICE_ACCOUNT_JSON exactly once per module instance (see
// fcm.ts's initAttempted flag) - vi.resetModules() + a dynamic import
// per test gets a fresh module for each scenario, the same pattern
// rate-limit.test.ts uses for its own lazily-initialized singleton.
describe("sendFcmPush", () => {
  const originalEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  beforeEach(() => {
    vi.resetModules();
    getApps.mockReturnValue([]);
    initializeApp.mockClear();
    cert.mockClear();
    getMessaging.mockClear();
    sendEachForMulticast.mockClear();
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
    expect(cert).not.toHaveBeenCalled();
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
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });
});

// Regression coverage for the deep-link payload this app's push
// notifications used to be missing entirely: sendPushNotification's `url`
// (already sent to Web Push subscribers) was silently dropped on the FCM
// path, so a tap on an Android (and, once registered, iOS) push
// notification had nothing to navigate to.
describe.skipIf(!hasRealDatabaseUrl)("sendFcmPush (deep-link data payload, real Postgres)", () => {
  const userIds: string[] = [];
  const originalEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  async function createUserWithToken() {
    const user = await prisma.user.create({
      data: {
        email: `fcm-${randomUUID().slice(0, 8)}@fcmtest.example`,
        username: `fcm${randomUUID().slice(0, 8)}`,
        password: "x",
        role: "USER",
      },
    });
    userIds.push(user.id);
    await prisma.fcmToken.create({
      data: { userId: user.id, token: `token-${randomUUID()}`, platform: "ios" },
    });
    return user;
  }

  beforeEach(() => {
    vi.resetModules();
    getApps.mockReturnValue([]);
    sendEachForMulticast.mockClear();
    sendEachForMulticast.mockResolvedValue({ responses: [{ success: true }] });
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(VALID_SERVICE_ACCOUNT);
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalEnv;
  });

  afterAll(async () => {
    await prisma.fcmToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("includes the caller's url as data.url alongside the notification, for any registered platform", async () => {
    const user = await createUserWithToken();
    const { sendFcmPush } = await import("../fcm");
    await sendFcmPush(user.id, "New Message", "Ada sent you a message.", "/messages/ada");

    expect(sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: { title: "New Message", body: "Ada sent you a message." },
        data: { url: "/messages/ada" },
      })
    );
  });

  it('defaults data.url to "/" when the caller doesn\'t supply one', async () => {
    const user = await createUserWithToken();
    const { sendFcmPush } = await import("../fcm");
    await sendFcmPush(user.id, "Title", "Body");

    expect(sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ data: { url: "/" } })
    );
  });
});
