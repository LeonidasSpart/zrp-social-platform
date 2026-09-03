import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

function providerIds(providers: any[]): string[] {
  return providers.map((p) => p.id ?? p.options?.id);
}

// Regression coverage for adding Sign in with Apple alongside the existing
// providers: Google and Credentials must always be present and unchanged,
// and Apple must appear only when fully configured - never as a half-wired
// provider that would fail confusingly at sign-in time instead of simply
// not being offered.
describe("authOptions providers (Sign in with Apple addition)", () => {
  it("always includes google and credentials, and omits apple when unconfigured", async () => {
    vi.resetModules();
    const { authOptions } = await import("../auth");
    const ids = providerIds(authOptions.providers as any[]);
    expect(ids).toContain("google");
    expect(ids).toContain("credentials");
    expect(ids).not.toContain("apple");
  });

  it("includes apple once fully configured with a valid EC key, without displacing google or credentials", async () => {
    const { privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    process.env.APPLE_TEAM_ID = "TEAM123";
    process.env.APPLE_KEY_ID = "KEY123";
    process.env.APPLE_CLIENT_ID = "one.zrp.social.web";
    process.env.APPLE_PRIVATE_KEY = pem.replace(/\n/g, "\\n");

    vi.resetModules();
    const { authOptions } = await import("../auth");
    const ids = providerIds(authOptions.providers as any[]);
    expect(ids).toContain("google");
    expect(ids).toContain("credentials");
    expect(ids).toContain("apple");
    expect(authOptions.providers).toHaveLength(3);
  });
});
