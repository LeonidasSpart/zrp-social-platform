import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const ENV_KEYS = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_CLIENT_ID", "APPLE_PRIVATE_KEY"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

// Regression coverage for Sign in with Apple's client-secret generation
// (src/lib/apple-client-secret.ts), the one piece of the Apple integration
// that isn't just "another NextAuth provider": NextAuth v4's built-in
// Apple provider expects clientSecret to already be a signed JWT, unlike
// Google, so this must produce one correctly, and must degrade to "Apple
// sign-in absent" rather than crash when unconfigured.
describe("getAppleClientSecret", () => {
  it("returns null when unconfigured - Apple sign-in must fail gracefully, not pretend to be available", async () => {
    const { getAppleClientSecret } = await import("../apple-client-secret");
    expect(getAppleClientSecret()).toBeNull();
  });

  it("returns null when only some of the four required env vars are set", async () => {
    process.env.APPLE_TEAM_ID = "TEAM123";
    process.env.APPLE_KEY_ID = "KEY123";
    // APPLE_CLIENT_ID and APPLE_PRIVATE_KEY deliberately left unset.
    const { getAppleClientSecret } = await import("../apple-client-secret");
    expect(getAppleClientSecret()).toBeNull();
  });

  it("signs a well-formed ES256 JWT when fully configured with a valid EC key", async () => {
    // A synthetic, randomly generated, disposable test keypair - not a
    // real Apple credential and never used for anything else.
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    process.env.APPLE_TEAM_ID = "TEAM123";
    process.env.APPLE_KEY_ID = "KEY123";
    process.env.APPLE_CLIENT_ID = "one.zrp.social.web";
    process.env.APPLE_PRIVATE_KEY = pem.replace(/\n/g, "\\n");

    const { getAppleClientSecret } = await import("../apple-client-secret");
    const secret = getAppleClientSecret();
    expect(secret).not.toBeNull();

    const parts = secret!.split(".");
    expect(parts).toHaveLength(3);

    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    expect(header).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(payload.iss).toBe("TEAM123");
    expect(payload.sub).toBe("one.zrp.social.web");
    expect(payload.aud).toBe("https://appleid.apple.com");
    expect(payload.exp).toBeGreaterThan(payload.iat);

    // The signature itself must actually verify against the public key -
    // not just "three base64url segments that look like a JWT."
    const derivedPublicKey = crypto.createPublicKey(privateKey);
    const signingInput = `${parts[0]}.${parts[1]}`;
    const signatureValid = crypto.verify(
      "sha256",
      Buffer.from(signingInput),
      { key: derivedPublicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(parts[2], "base64url")
    );
    expect(signatureValid).toBe(true);
  });

  it("returns null (never throws) when APPLE_PRIVATE_KEY is present but not a valid key", async () => {
    process.env.APPLE_TEAM_ID = "TEAM123";
    process.env.APPLE_KEY_ID = "KEY123";
    process.env.APPLE_CLIENT_ID = "one.zrp.social.web";
    process.env.APPLE_PRIVATE_KEY = "not-a-real-key";

    const { getAppleClientSecret } = await import("../apple-client-secret");
    expect(() => getAppleClientSecret()).not.toThrow();
    expect(getAppleClientSecret()).toBeNull();
  });
});
