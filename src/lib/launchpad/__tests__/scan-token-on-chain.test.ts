import { describe, it, expect, vi, beforeEach } from "vitest";

/*
 * Unit coverage for scanTokenOnChain's retry wrapper around
 * token-scanner.ts's already-tested scanToken - absorbs brief RPC
 * propagation lag right after a mint confirms (the client calls the
 * create-token route essentially the instant its own confirmation
 * promise resolves, which can occasionally outrace a load-balanced
 * RPC's own view of the slot) without ever fabricating a result.
 */
const { scanToken } = vi.hoisted(() => ({ scanToken: vi.fn() }));
vi.mock("../token-scanner", () => ({ scanToken }));

import { scanTokenOnChain } from "../mint-verification";

describe("scanTokenOnChain", () => {
  beforeEach(() => {
    scanToken.mockReset();
  });

  it("returns the result immediately on the first successful attempt", async () => {
    scanToken.mockResolvedValue({ mintAddress: "mint1" });

    const result = await scanTokenOnChain("mint1", 3, 1);
    expect(result).toEqual({ mintAddress: "mint1" });
    expect(scanToken).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds once the mint becomes readable", async () => {
    scanToken.mockRejectedValueOnce(new Error("not found")).mockResolvedValueOnce({ mintAddress: "mint1" });

    const result = await scanTokenOnChain("mint1", 3, 1);
    expect(result).toEqual({ mintAddress: "mint1" });
    expect(scanToken).toHaveBeenCalledTimes(2);
  });

  it("throws the last error once every attempt is exhausted, never fabricating a result", async () => {
    scanToken.mockRejectedValue(new Error("still not found"));

    await expect(scanTokenOnChain("mint1", 2, 1)).rejects.toThrow("still not found");
    expect(scanToken).toHaveBeenCalledTimes(2);
  });
});
