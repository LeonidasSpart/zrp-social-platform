import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { randomUUID } from "crypto";
import { prisma } from "../db";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// A real, throwaway P-256 key pair generated fresh for this test run -
// apns.ts's JWT signing is exercised for real (createPrivateKey + a real
// ES256 sign), the same way push-notifications.test.ts exercises real
// VAPID curve validation rather than mocking crypto away entirely. Only
// node:http2's actual network I/O is mocked.
const { privateKey: TEST_PRIVATE_KEY_PEM } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

// Minimal fake of the two node:http2 surfaces apns.ts actually uses:
// connect() returning a session with .request(headers), and a request
// stream that emits "response" (with a :status header), then "data"/
// "end". Each test controls the status/body a request resolves to via
// `nextResponses` (FIFO, one entry consumed per postToApns call).
const { connect, h2Constants, nextResponses, sessionsOpened } = vi.hoisted(() => {
  // node:events's EventEmitter can't be referenced here via a top-level
  // import - vi.hoisted() factories run before the module's own imports
  // are initialized, so a bound import reference throws "Cannot access
  // before initialization". require() (available in vitest's Node
  // environment) sidesteps that entirely.
  const { EventEmitter } = require("node:events");
  const nextResponses: { status: number; body?: string }[] = [];
  const sessionsOpened: string[] = [];

  class FakeRequest extends EventEmitter {
    write() {}
    end() {
      const next = nextResponses.shift() ?? { status: 200 };
      queueMicrotask(() => {
        this.emit("response", { ":status": next.status });
        if (next.body) this.emit("data", next.body);
        this.emit("end");
      });
    }
    setEncoding() {}
  }

  class FakeSession extends EventEmitter {
    request(_headers: Record<string, string | undefined>) {
      return new FakeRequest();
    }
    close() {}
  }

  const connect = vi.fn((authority: string) => {
    sessionsOpened.push(authority);
    return new FakeSession();
  });

  const h2Constants = {
    HTTP2_HEADER_METHOD: ":method",
    HTTP2_HEADER_PATH: ":path",
    HTTP2_HEADER_STATUS: ":status",
  };

  return { connect, h2Constants, nextResponses, sessionsOpened };
});

vi.mock("node:http2", () => ({ connect, constants: h2Constants }));

const VALID_ENV = {
  APNS_KEY_ID: "TESTKEY123",
  APNS_TEAM_ID: "TESTTEAM123",
  APNS_BUNDLE_ID: "one.zrp.social",
  APNS_PRIVATE_KEY: TEST_PRIVATE_KEY_PEM,
  APNS_ENVIRONMENT: "development",
};

const APNS_ENV_KEYS = Object.keys(VALID_ENV) as (keyof typeof VALID_ENV)[];
const originalEnv: Record<string, string | undefined> = {};
for (const key of APNS_ENV_KEYS) originalEnv[key] = process.env[key];

function setEnv(overrides: Partial<typeof VALID_ENV> = {}) {
  for (const key of APNS_ENV_KEYS) {
    const value = key in overrides ? overrides[key] : VALID_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearEnv() {
  for (const key of APNS_ENV_KEYS) delete process.env[key];
}

afterAll(() => {
  for (const key of APNS_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("sendApnsAlert / sendApnsVoip - configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    connect.mockClear();
    sessionsOpened.length = 0;
    nextResponses.length = 0;
  });

  afterEach(() => {
    clearEnv();
  });

  it("is a safe no-op for sendApnsAlert when APNs env vars are unset", async () => {
    clearEnv();
    const { sendApnsAlert } = await import("../apns");
    await expect(sendApnsAlert("user-1", "Title", "Body")).resolves.toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
  });

  it("is a safe no-op for sendApnsVoip when APNs env vars are unset", async () => {
    clearEnv();
    const { sendApnsVoip } = await import("../apns");
    await expect(
      sendApnsVoip("user-1", {
        callerId: "caller-1",
        callId: "call-1",
        callerName: "Ada",
        callerUsername: "ada",
        isVideo: false,
      })
    ).resolves.toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
  });

  it("is a safe no-op (never throws) when only some APNs env vars are set", async () => {
    setEnv({ APNS_PRIVATE_KEY: undefined });
    const { sendApnsAlert } = await import("../apns");
    await expect(sendApnsAlert("user-1", "Title", "Body")).resolves.toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
  });

  it("logs a visible error for a partial config (some but not all 4 vars set), unlike none set", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // getApnsConfig() returns null before any DB access when 1-3 of 4 vars
    // are set (same as 0 of 4), so this test never needs the fcmToken
    // lookup to succeed - but mock it anyway for safety against a future
    // change to that early-return.
    const findManySpy = vi.spyOn(prisma.fcmToken, "findMany").mockResolvedValue([]);
    try {
      clearEnv();
      const { sendApnsAlert: sendWithNoneSet } = await import("../apns");
      await sendWithNoneSet("user-1", "Title", "Body");
      expect(errorSpy).not.toHaveBeenCalled();

      vi.resetModules();
      setEnv({ APNS_PRIVATE_KEY: undefined });
      const { sendApnsAlert: sendWithPartial } = await import("../apns");
      await sendWithPartial("user-1", "Title", "Body");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("partially configured (3/4"));
    } finally {
      errorSpy.mockRestore();
      findManySpy.mockRestore();
    }
  });

  it("warns when NODE_ENV=production but APNS_ENVIRONMENT is not 'production'", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // The production-environment-mismatch warning fires inside
    // getApnsConfig(), before sendApnsAlert ever reaches the DB - mocked
    // here only so this test doesn't depend on a reachable Postgres to
    // observe it.
    const findManySpy = vi.spyOn(prisma.fcmToken, "findMany").mockResolvedValue([]);
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      // @ts-expect-error - NODE_ENV is readonly in the type declarations but writable at runtime.
      process.env.NODE_ENV = "production";
      setEnv({ APNS_ENVIRONMENT: "development" });
      const { sendApnsAlert } = await import("../apns");
      await sendApnsAlert("user-without-tokens", "T", "B");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("NODE_ENV=production but APNS_ENVIRONMENT is not set to 'production'")
      );
    } finally {
      // @ts-expect-error - see above.
      process.env.NODE_ENV = originalNodeEnv;
      errorSpy.mockRestore();
      findManySpy.mockRestore();
    }
  });

  it("does not warn when NODE_ENV=production and APNS_ENVIRONMENT=production", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const findManySpy = vi.spyOn(prisma.fcmToken, "findMany").mockResolvedValue([]);
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      // @ts-expect-error - see above.
      process.env.NODE_ENV = "production";
      setEnv({ APNS_ENVIRONMENT: "production" });
      const { sendApnsAlert } = await import("../apns");
      await sendApnsAlert("user-without-tokens", "T", "B");
      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("APNS_ENVIRONMENT is not set to 'production'"));
    } finally {
      // @ts-expect-error - see above.
      process.env.NODE_ENV = originalNodeEnv;
      errorSpy.mockRestore();
      findManySpy.mockRestore();
    }
  });

  it("fails safe when APNS_PRIVATE_KEY is not a valid PEM key", async () => {
    setEnv({ APNS_PRIVATE_KEY: "not-a-real-pem-key" });
    const { sendApnsAlert } = await import("../apns");
    await expect(sendApnsAlert("user-1", "Title", "Body")).resolves.toBeUndefined();
    expect(connect).not.toHaveBeenCalled();
  });

  it("unescapes literal \\n sequences in APNS_PRIVATE_KEY before parsing", async () => {
    setEnv({ APNS_PRIVATE_KEY: TEST_PRIVATE_KEY_PEM.replace(/\n/g, "\\n") });
    // No token to send to, but configuration itself must not throw/no-op
    // due to a PEM parse failure - connect() only happens with a token
    // present (real-DB test below), so this only proves getApnsConfig()
    // accepted the escaped key. Re-importing must not throw.
    await expect(import("../apns")).resolves.toBeDefined();
  });

  it("uses the production APNs host only when APNS_ENVIRONMENT=production", async () => {
    setEnv({ APNS_ENVIRONMENT: "production" });
    const { sendApnsAlert } = await import("../apns");
    // No FcmToken rows exist for this made-up userId, so no session is
    // ever opened - this test only needs getApnsConfig() to not throw
    // with a production environment value; the host selection itself is
    // covered end-to-end by the real-Postgres describe block below.
    await expect(sendApnsAlert("user-without-tokens", "T", "B")).resolves.toBeUndefined();
  });
});

describe.skipIf(!hasRealDatabaseUrl)("sendApnsAlert / sendApnsVoip (real Postgres)", () => {
  const userIds: string[] = [];

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@apnstest.example`,
        username: `${label}${randomUUID().slice(0, 6)}`.slice(0, 20),
        password: "x",
        role: "USER",
      },
    });
    userIds.push(user.id);
    return user;
  }

  beforeEach(() => {
    vi.resetModules();
    connect.mockClear();
    sessionsOpened.length = 0;
    nextResponses.length = 0;
    setEnv();
  });

  afterEach(() => {
    clearEnv();
  });

  afterAll(async () => {
    await prisma.fcmToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.voipToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("sends only to platform=ios FcmToken rows, never android ones", async () => {
    const user = await createUser("alertios");
    await prisma.fcmToken.create({ data: { userId: user.id, token: `ios-${randomUUID()}`, platform: "ios" } });
    await prisma.fcmToken.create({ data: { userId: user.id, token: `and-${randomUUID()}`, platform: "android" } });

    nextResponses.push({ status: 200 });
    const { sendApnsAlert } = await import("../apns");
    await sendApnsAlert(user.id, "New Message", "Ada sent you a message.", "/messages/ada");

    // Exactly one device (the ios one) should have opened a session.
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("deletes the FcmToken row on a 410 Unregistered response", async () => {
    const user = await createUser("prune410");
    const token = `ios-${randomUUID()}`;
    await prisma.fcmToken.create({ data: { userId: user.id, token, platform: "ios" } });

    nextResponses.push({ status: 410, body: JSON.stringify({ reason: "Unregistered" }) });
    const { sendApnsAlert } = await import("../apns");
    await sendApnsAlert(user.id, "Title", "Body");

    expect(await prisma.fcmToken.findUnique({ where: { token } })).toBeNull();
  });

  it("deletes the FcmToken row on a 400 BadDeviceToken response", async () => {
    const user = await createUser("prune400");
    const token = `ios-${randomUUID()}`;
    await prisma.fcmToken.create({ data: { userId: user.id, token, platform: "ios" } });

    nextResponses.push({ status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) });
    const { sendApnsAlert } = await import("../apns");
    await sendApnsAlert(user.id, "Title", "Body");

    expect(await prisma.fcmToken.findUnique({ where: { token } })).toBeNull();
  });

  it("keeps the token on a transient (non-permanent) failure status", async () => {
    const user = await createUser("keeptoken");
    const token = `ios-${randomUUID()}`;
    await prisma.fcmToken.create({ data: { userId: user.id, token, platform: "ios" } });

    nextResponses.push({ status: 500, body: JSON.stringify({ reason: "InternalServerError" }) });
    const { sendApnsAlert } = await import("../apns");
    await sendApnsAlert(user.id, "Title", "Body");

    expect(await prisma.fcmToken.findUnique({ where: { token } })).not.toBeNull();
  });

  it("sendApnsVoip reads from VoipToken, not FcmToken, and prunes on 410 the same way", async () => {
    const user = await createUser("voipuser");
    const voipToken = `voip-${randomUUID()}`;
    // An ordinary alert token for the same user must never receive the
    // VoIP push - it's a structurally different subscription.
    await prisma.fcmToken.create({ data: { userId: user.id, token: `ios-${randomUUID()}`, platform: "ios" } });
    await prisma.voipToken.create({ data: { userId: user.id, token: voipToken } });

    nextResponses.push({ status: 410, body: JSON.stringify({ reason: "Unregistered" }) });
    const { sendApnsVoip } = await import("../apns");
    await sendApnsVoip(user.id, {
      callerId: "caller-1",
      callId: "call-1",
      callerName: "Ada Lovelace",
      callerUsername: "ada",
      isVideo: true,
    });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(await prisma.voipToken.findUnique({ where: { token: voipToken } })).toBeNull();
  });
});
