import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getServerSession, upsert, deleteMany } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  upsert: vi.fn(async () => ({})),
  deleteMany: vi.fn(async () => ({ count: 1 })),
}));

vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({
  prisma: { pushSubscription: { upsert, deleteMany } },
}));

import { POST as subscribe } from "../subscribe/route";

const NEW_ENDPOINT = "https://fcm.googleapis.com/fcm/send/NEW-ENDPOINT";
const OLD_ENDPOINT = "https://fcm.googleapis.com/fcm/send/OLD-ENDPOINT";

function req(body: unknown) {
  return new NextRequest("https://zrp.one/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const subscription = {
  endpoint: NEW_ENDPOINT,
  keys: { p256dh: "p256dh-value", auth: "auth-value" },
};

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    upsert.mockClear();
    deleteMany.mockClear();
    getServerSession.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("stores the new subscription", async () => {
    const res = await subscribe(req({ subscription }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endpoint: NEW_ENDPOINT } })
    );
  });

  // A subscription made under the old VAPID key can never receive another
  // notification, and the delivery loop only prunes 404/410 - not the 403
  // a key mismatch returns. Without this the row would linger forever.
  it("removes the endpoint the client just replaced after a VAPID key rotation", async () => {
    const res = await subscribe(
      req({ subscription, previousEndpoint: OLD_ENDPOINT })
    );
    expect(res.status).toBe(200);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { endpoint: OLD_ENDPOINT, userId: "user-1" },
    });
  });

  it("scopes the cleanup to the caller so it cannot delete another user's subscription", async () => {
    getServerSession.mockResolvedValue({ user: { id: "attacker" } });
    await subscribe(req({ subscription, previousEndpoint: OLD_ENDPOINT }));
    expect(deleteMany).toHaveBeenCalledWith({
      where: { endpoint: OLD_ENDPOINT, userId: "attacker" },
    });
  });

  it("deletes nothing on a normal first-time subscribe", async () => {
    await subscribe(req({ subscription }));
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("deletes nothing when the endpoint is unchanged", async () => {
    await subscribe(req({ subscription, previousEndpoint: NEW_ENDPOINT }));
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("ignores a non-string previousEndpoint instead of throwing", async () => {
    const res = await subscribe(
      req({ subscription, previousEndpoint: { $ne: null } })
    );
    expect(res.status).toBe(200);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await subscribe(req({ subscription }));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
