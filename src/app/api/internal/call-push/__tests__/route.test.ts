import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { sendPushNotification } = vi.hoisted(() => ({
  sendPushNotification: vi.fn(async () => {}),
}));
vi.mock("@/lib/push-notifications", () => ({ sendPushNotification }));

import { POST } from "../route";

// This route is server.js's only way to trigger a real push notification
// for an incoming call - server.js is a raw Node process, not a Next.js
// request context, so it cannot import src/lib/push-notifications.ts
// directly (see the route's own comment). It must therefore fail CLOSED
// exactly like /api/cron/* (same bearer-secret pattern), since unlike a
// cron endpoint it is invoked automatically on every single call attempt
// and must never be a way for an outside caller to spam a user's device
// with fake "Incoming call" push notifications.
function call(body: unknown, secret?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== undefined) headers.set("authorization", `Bearer ${secret}`);
  return POST(
    new NextRequest("https://zrp.one/api/internal/call-push", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/internal/call-push", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.INTERNAL_PUSH_SECRET;
    process.env.INTERNAL_PUSH_SECRET = "test-secret";
    sendPushNotification.mockClear();
  });

  afterEach(() => {
    process.env.INTERNAL_PUSH_SECRET = originalSecret;
  });

  it("rejects a request with no or an incorrect secret", async () => {
    const body = { receiverId: "u1", callerName: "Ada", callerUsername: "ada", isVideo: false };
    expect((await call(body)).status).toBe(401);
    expect((await call(body, "wrong")).status).toBe(401);
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it("fails closed when INTERNAL_PUSH_SECRET is unset, even with a matching header", async () => {
    delete process.env.INTERNAL_PUSH_SECRET;
    const res = await call(
      { receiverId: "u1", callerName: "Ada", callerUsername: "ada", isVideo: false },
      "test-secret"
    );
    expect(res.status).toBe(401);
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it("accepts server.js's own loopback call even though Next.js stamps X-Forwarded-For on it", async () => {
    // Next's request handler sets x-forwarded-for to the socket address
    // (127.0.0.1 here) on EVERY request, so the route must not use that
    // header to decide "external" - that check silently 404'd every
    // incoming-call push. Loopback-only is enforced in server.js instead.
    const res = await POST(
      new NextRequest("http://127.0.0.1:8080/api/internal/call-push", {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          authorization: "Bearer test-secret",
          "x-forwarded-for": "127.0.0.1",
        }),
        body: JSON.stringify({ receiverId: "u1", callerName: "Ada", callerUsername: "ada", isVideo: false }),
      })
    );
    expect(res.status).toBe(200);
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it("rejects a secret that only matches as a prefix", async () => {
    const body = { receiverId: "u1", callerName: "Ada", callerUsername: "ada", isVideo: false };
    expect((await call(body, "test-secre")).status).toBe(401);
    expect((await call(body, "test-secret-extra")).status).toBe(401);
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it("rejects a payload missing required fields", async () => {
    const res = await call({ receiverId: "u1" }, "test-secret");
    expect(res.status).toBe(400);
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it("sends a voice-call push that names the caller and deep-links to the conversation", async () => {
    const res = await call(
      { receiverId: "u1", callerName: "Ada Lovelace", callerUsername: "ada", isVideo: false },
      "test-secret"
    );
    expect(res.status).toBe(200);
    expect(sendPushNotification).toHaveBeenCalledWith(
      "u1",
      "Incoming voice call",
      "Ada Lovelace is calling you",
      "/messages/ada"
    );
  });

  it("distinguishes a video call from a voice call in the notification title", async () => {
    await call(
      { receiverId: "u1", callerName: "Ada Lovelace", callerUsername: "ada", isVideo: true },
      "test-secret"
    );
    expect(sendPushNotification).toHaveBeenCalledWith(
      "u1",
      "Incoming video call",
      "Ada Lovelace is calling you",
      "/messages/ada"
    );
  });

  it("never surfaces a push failure as an error response", async () => {
    sendPushNotification.mockRejectedValueOnce(new Error("push provider down"));
    const res = await call(
      { receiverId: "u1", callerName: "Ada", callerUsername: "ada", isVideo: false },
      "test-secret"
    );
    expect(res.status).toBe(200);
    const bodyJson = await res.json();
    expect(bodyJson.ok).toBe(false);
  });
});
