import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TokenVerifier, AccessToken, WebhookReceiver } from "livekit-server-sdk";

/*
 * These are the parts of the LiveKit integration that are REAL,
 * production code independent of a reachable LiveKit server - see
 * src/lib/live-audio/livekit.ts's own top-of-file comment and
 * docs/live-audio-architecture.md §2. Token minting is pure local JWT
 * signing; webhook verification is pure local HMAC/signature
 * verification. Neither needs LIVEKIT_URL to be reachable, so both are
 * tested here for real rather than mocked - only the actual network
 * connection to a running LiveKit server is the untestable-in-this-
 * sandbox boundary.
 */

const TEST_API_KEY = "test-api-key";
const TEST_API_SECRET = "test-api-secret-at-least-32-characters-long";

describe("Live Audio / LiveKit integration", () => {
  beforeEach(() => {
    vi.stubEnv("LIVEKIT_API_KEY", TEST_API_KEY);
    vi.stubEnv("LIVEKIT_API_SECRET", TEST_API_SECRET);
    vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getLiveKitConfig", () => {
    it("returns null when any required env var is missing - fails closed, never a fake config", async () => {
      vi.stubEnv("LIVEKIT_API_KEY", "");
      const { getLiveKitConfig } = await import("../livekit");
      expect(getLiveKitConfig()).toBeNull();
    });

    it("returns the config when all three env vars are set", async () => {
      const { getLiveKitConfig } = await import("../livekit");
      expect(getLiveKitConfig()).toEqual({
        apiKey: TEST_API_KEY,
        apiSecret: TEST_API_SECRET,
        url: "wss://example.livekit.cloud",
      });
    });
  });

  describe("mintLiveKitToken", () => {
    it("returns null (not a fake token) when unconfigured", async () => {
      vi.stubEnv("LIVEKIT_API_KEY", "");
      const { mintLiveKitToken } = await import("../livekit");
      const token = await mintLiveKitToken({
        roomId: "room1",
        userId: "user1",
        displayName: "User One",
        role: "LISTENER",
      });
      expect(token).toBeNull();
    });

    it("a LISTENER token never carries canPublish - the core anti-privilege-escalation guarantee", async () => {
      const { mintLiveKitToken } = await import("../livekit");
      const token = await mintLiveKitToken({
        roomId: "room1",
        userId: "listener1",
        displayName: "Listener One",
        role: "LISTENER",
      });
      expect(token).toBeTypeOf("string");

      const verifier = new TokenVerifier(TEST_API_KEY, TEST_API_SECRET);
      const claims = await verifier.verify(token!);
      expect(claims.video?.canPublish).toBeFalsy();
      expect(claims.video?.canSubscribe).toBe(true);
      expect(claims.video?.roomAdmin).toBeFalsy();
      expect(claims.video?.room).toBe("room1");
      expect(claims.sub).toBe("listener1");
    });

    it("a SPEAKER token carries canPublish but not roomAdmin", async () => {
      const { mintLiveKitToken } = await import("../livekit");
      const token = await mintLiveKitToken({
        roomId: "room1",
        userId: "speaker1",
        displayName: "Speaker One",
        role: "SPEAKER",
      });
      const verifier = new TokenVerifier(TEST_API_KEY, TEST_API_SECRET);
      const claims = await verifier.verify(token!);
      expect(claims.video?.canPublish).toBe(true);
      expect(claims.video?.roomAdmin).toBeFalsy();
    });

    it("a HOST token carries both canPublish and roomAdmin", async () => {
      const { mintLiveKitToken } = await import("../livekit");
      const token = await mintLiveKitToken({
        roomId: "room1",
        userId: "host1",
        displayName: "Host One",
        role: "HOST",
      });
      const verifier = new TokenVerifier(TEST_API_KEY, TEST_API_SECRET);
      const claims = await verifier.verify(token!);
      expect(claims.video?.canPublish).toBe(true);
      expect(claims.video?.roomAdmin).toBe(true);
    });

    it("a MODERATOR token carries both canPublish and roomAdmin, same as HOST", async () => {
      const { mintLiveKitToken } = await import("../livekit");
      const token = await mintLiveKitToken({
        roomId: "room1",
        userId: "mod1",
        displayName: "Mod One",
        role: "MODERATOR",
      });
      const verifier = new TokenVerifier(TEST_API_KEY, TEST_API_SECRET);
      const claims = await verifier.verify(token!);
      expect(claims.video?.canPublish).toBe(true);
      expect(claims.video?.roomAdmin).toBe(true);
    });

    it("the token's identity is the real ZRP userId, not a client-suppliable value", async () => {
      const { mintLiveKitToken } = await import("../livekit");
      const token = await mintLiveKitToken({
        roomId: "room1",
        userId: "the-real-user-id",
        displayName: "Someone Else Entirely",
        role: "LISTENER",
      });
      const verifier = new TokenVerifier(TEST_API_KEY, TEST_API_SECRET);
      const claims = await verifier.verify(token!);
      expect(claims.sub).toBe("the-real-user-id");
      // display name is cosmetic only, carried separately from identity
      expect(claims.name).toBe("Someone Else Entirely");
    });
  });

  describe("verifyLiveKitWebhook", () => {
    it("rejects a request with no auth header", async () => {
      const { verifyLiveKitWebhook } = await import("../livekit");
      const result = await verifyLiveKitWebhook("{}", null);
      expect(result).toBeNull();
    });

    it("rejects a tampered body even with a validly-formed auth header from a DIFFERENT payload", async () => {
      const receiver = new WebhookReceiver(TEST_API_KEY, TEST_API_SECRET);
      // Sign one payload for real, then present a different body under
      // that same signature - simulating an attacker who intercepted a
      // real webhook and tried to replay it with modified content.
      const originalBody = JSON.stringify({ event: "room_finished", room: { name: "room1" } });
      // WebhookReceiver has no public "sign" - so instead we prove
      // tamper-rejection using AccessToken's own sha256 field, which
      // WebhookReceiver's verify() checks the body hash against. This
      // confirms the verifier is actually checking payload integrity,
      // not just presence of a header.
      const token = new AccessToken(TEST_API_KEY, TEST_API_SECRET);
      const crypto = await import("crypto");
      token.sha256 = crypto.createHash("sha256").update(originalBody).digest("base64");
      const authHeader = await token.toJwt();

      const { verifyLiveKitWebhook } = await import("../livekit");
      const tamperedBody = JSON.stringify({ event: "room_finished", room: { name: "attacker-room" } });
      const result = await verifyLiveKitWebhook(tamperedBody, authHeader);
      expect(result).toBeNull();
    });

    it("accepts a genuinely signed, unmodified payload", async () => {
      const body = JSON.stringify({ event: "room_finished", room: { name: "room1" } });
      const token = new AccessToken(TEST_API_KEY, TEST_API_SECRET);
      const crypto = await import("crypto");
      token.sha256 = crypto.createHash("sha256").update(body).digest("base64");
      const authHeader = await token.toJwt();

      const { verifyLiveKitWebhook } = await import("../livekit");
      const result = await verifyLiveKitWebhook(body, authHeader);
      expect(result).not.toBeNull();
      expect(result?.event).toBe("room_finished");
    });

    it("returns null when webhook config is unset, never processes unverified", async () => {
      vi.stubEnv("LIVEKIT_API_KEY", "");
      vi.stubEnv("LIVEKIT_WEBHOOK_API_KEY", "");
      const { verifyLiveKitWebhook } = await import("../livekit");
      const result = await verifyLiveKitWebhook("{}", "Bearer whatever");
      expect(result).toBeNull();
    });
  });
});
