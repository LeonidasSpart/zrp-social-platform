import { describe, it, expect, vi, beforeEach } from "vitest";

// A real, valid P-256 VAPID pair (generated once via web-push's own
// generateVAPIDKeys()) so getWebPush()'s curve validation - which
// actually decodes the public key as a JWK EC point - passes. These are
// not secrets; they're never used against a real push service in tests.
process.env.VAPID_PUBLIC_KEY =
  "BImYGJlnHi3IlHjm9zvLaLGqT3Ju20HeTXmapyg-r6Fh9pCXYYqtCL_1gtZaeCW9ymxP8S0pi7CGZi99AGhDePo";
process.env.VAPID_PRIVATE_KEY = "1Q1M829rXMcJ82XurjUHxZLQfRf_gzvdheEjvQTgcew";

const { sendNotification, setVapidDetails } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));
vi.mock("web-push", () => ({
  default: { sendNotification, setVapidDetails },
}));

const { sendFcmPush } = vi.hoisted(() => ({ sendFcmPush: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../fcm", () => ({ sendFcmPush }));

const { findMany, deletePushSubscription } = vi.hoisted(() => ({
  findMany: vi.fn(),
  deletePushSubscription: vi.fn(),
}));
vi.mock("../db", () => ({
  prisma: { pushSubscription: { findMany, delete: deletePushSubscription } },
}));

import { sendPushNotification } from "../push-notifications";

function webPushError(statusCode: number, body: string) {
  const err: any = new Error("web-push error");
  err.statusCode = statusCode;
  err.body = body;
  return err;
}

const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "x", auth: "y" } });

/*
 * Regression coverage for the production issue: every push to a
 * subscription created under a since-rotated VAPID key fails forever
 * with a 403 whose body says the credentials "do not correspond to the
 * credentials used to create the subscriptions" - functionally
 * identical to a 410 Gone (the browser bakes the public key into the
 * subscription at creation time, so no retry can ever succeed), but the
 * old code only pruned on 404/410, so this specific case just logged an
 * error on every single notification, forever.
 */
describe("sendPushNotification - dead subscription pruning", () => {
  beforeEach(() => {
    sendNotification.mockReset();
    setVapidDetails.mockReset();
    findMany.mockReset();
    deletePushSubscription.mockReset();
  });

  it("prunes a subscription on the FCM VAPID-key-mismatch 403", async () => {
    findMany.mockResolvedValue([sub("https://fcm.example/a")]);
    sendNotification.mockRejectedValue(
      webPushError(
        403,
        "the VAPID credentials in the authorization header do not correspond to the credentials used to create the subscriptions.\n"
      )
    );

    await sendPushNotification("user1", "title", "body");

    expect(deletePushSubscription).toHaveBeenCalledWith({ where: { endpoint: "https://fcm.example/a" } });
  });

  it("still prunes on 404 and 410 (existing behavior, unchanged)", async () => {
    findMany.mockResolvedValue([sub("https://fcm.example/b")]);
    sendNotification.mockRejectedValueOnce(webPushError(410, "gone"));
    await sendPushNotification("user1", "title", "body");
    expect(deletePushSubscription).toHaveBeenCalledWith({ where: { endpoint: "https://fcm.example/b" } });

    deletePushSubscription.mockClear();
    findMany.mockResolvedValue([sub("https://fcm.example/c")]);
    sendNotification.mockRejectedValueOnce(webPushError(404, "not found"));
    await sendPushNotification("user1", "title", "body");
    expect(deletePushSubscription).toHaveBeenCalledWith({ where: { endpoint: "https://fcm.example/c" } });
  });

  it("does NOT prune on a 403 with a different body - only the exact VAPID-mismatch message is treated as permanent", async () => {
    findMany.mockResolvedValue([sub("https://fcm.example/d")]);
    sendNotification.mockRejectedValue(webPushError(403, "some unrelated authorization failure"));

    await sendPushNotification("user1", "title", "body");

    expect(deletePushSubscription).not.toHaveBeenCalled();
  });

  it("does NOT prune on a transient error (e.g. 500 or 429) - those must be left for the next send to retry", async () => {
    findMany.mockResolvedValue([sub("https://fcm.example/e")]);
    sendNotification.mockRejectedValue(webPushError(500, "upstream error"));

    await sendPushNotification("user1", "title", "body");

    expect(deletePushSubscription).not.toHaveBeenCalled();
  });

  it("one dead subscription failing never stops delivery to the user's other subscriptions", async () => {
    findMany.mockResolvedValue([sub("https://fcm.example/dead"), sub("https://fcm.example/alive")]);
    sendNotification.mockImplementation(async (target: { endpoint: string }) => {
      if (target.endpoint === "https://fcm.example/dead") {
        throw webPushError(410, "gone");
      }
      return { statusCode: 201 };
    });

    await sendPushNotification("user1", "title", "body");

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(deletePushSubscription).toHaveBeenCalledWith({ where: { endpoint: "https://fcm.example/dead" } });
    expect(deletePushSubscription).not.toHaveBeenCalledWith({ where: { endpoint: "https://fcm.example/alive" } });
  });
});
