import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getSwapTransaction } = vi.hoisted(() => ({
  getSwapTransaction: vi.fn(),
}));
vi.mock("@/lib/launchpad/dex-aggregator", () => ({ getSwapTransaction }));
// Without a real Redis available, checkRateLimitKey's connect-and-retry
// path adds multi-second delays per call (see claim-dispute.integration.test.ts's
// identical note) - this suite is about the route's validation/relay
// logic, not rate limiting itself, so bypass it for determinism.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, rateLimit: vi.fn().mockResolvedValue({ success: true }) };
});

import { POST } from "../route";

const WALLET = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

function req(body: unknown, ip = "10.0.0.60") {
  return new NextRequest("https://zrp.one/api/launchpad/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/launchpad/swap", () => {
  beforeEach(() => {
    getSwapTransaction.mockReset();
  });

  it("rejects an invalid userPublicKey (400) without calling Jupiter", async () => {
    const res = await POST(req({ userPublicKey: "not-a-pubkey", quoteResponse: { a: 1 } }));
    expect(res.status).toBe(400);
    expect(getSwapTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing quoteResponse (400)", async () => {
    const res = await POST(req({ userPublicKey: WALLET }));
    expect(res.status).toBe(400);
    expect(getSwapTransaction).not.toHaveBeenCalled();
  });

  it("happy path: relays the quoteResponse verbatim and returns the built transaction", async () => {
    getSwapTransaction.mockResolvedValue({ swapTransactionBase64: "base64-tx", lastValidBlockHeight: 42 });

    const quoteResponse = { inputMint: "a", outputMint: "b", inAmount: "1" };
    const res = await POST(req({ userPublicKey: WALLET, quoteResponse }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ swapTransactionBase64: "base64-tx", lastValidBlockHeight: 42 });
    expect(getSwapTransaction).toHaveBeenCalledWith({ quoteResponse, userPublicKey: WALLET });
  });

  it("returns 502 when building the transaction fails rather than fabricating one", async () => {
    getSwapTransaction.mockRejectedValue(new Error("Jupiter unreachable"));
    const res = await POST(req({ userPublicKey: WALLET, quoteResponse: { a: 1 } }));
    expect(res.status).toBe(502);
  });
});
