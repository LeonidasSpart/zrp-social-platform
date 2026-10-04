import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PublicKey } from "@solana/web3.js";

const { getConnection, rateLimit, getZrpGlobalConfig, programId } = vi.hoisted(() => {
  const { PublicKey: PK } = require("@solana/web3.js");
  return {
    getConnection: vi.fn(),
    rateLimit: vi.fn(),
    getZrpGlobalConfig: vi.fn(),
    programId: new PK("3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK"),
  };
});

vi.mock("@/lib/solana", () => ({ getConnection }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/launchpad/zrp-launch-service", () => ({ getZrpGlobalConfig }));
vi.mock("@/lib/launchpad/zrp-launch-keys", () => ({ getZrpLaunchProgramId: () => programId }));

import { GET } from "./route";

function req(): NextRequest {
  return new NextRequest("https://zrp.one/api/launchpad/zrp/global-config");
}

describe("GET /api/launchpad/zrp/global-config", () => {
  beforeEach(() => {
    getConnection.mockReset();
    rateLimit.mockReset();
    getZrpGlobalConfig.mockReset();
  });

  it("serializes the real on-chain GlobalConfig's fee fields for a client to build a transaction with", async () => {
    rateLimit.mockResolvedValue({ success: true });
    const feeRecipient = new PublicKey("DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ");
    getZrpGlobalConfig.mockResolvedValue({
      authority: PublicKey.default,
      feeRecipient,
      migrationAuthority: PublicKey.default,
      creationFeeLamports: BigInt(50_000_000),
      buyFeeBps: 100,
      sellFeeBps: 100,
      initialVirtualSolReserves: BigInt(30_000_000_000),
      initialVirtualTokenReserves: BigInt(1_073_000_000_000_000),
      tokenTotalSupply: BigInt(1_000_000_000_000_000),
      graduationSolTarget: BigInt(85_000_000_000),
      tokenDecimals: 6,
      bump: 255,
    });

    const response = await GET(req());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      programId: programId.toBase58(),
      feeRecipient: feeRecipient.toBase58(),
      buyFeeBps: 100,
      sellFeeBps: 100,
      creationFeeLamports: "50000000",
    });
  });

  it("is rate-limited before reading on-chain config", async () => {
    const limitedResponse = new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    rateLimit.mockResolvedValue({ success: false, response: limitedResponse });

    const response = await GET(req());
    expect(response.status).toBe(429);
    expect(getZrpGlobalConfig).not.toHaveBeenCalled();
  });
});
