import { describe, it, expect, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CREATE_CPMM_POOL_PROGRAM } from "@raydium-io/raydium-sdk-v2";
import { deriveCreatePoolKeys } from "../cpmm-keys";
import {
  verifyPoolCreationTransaction,
  verifyLiquidityTransaction,
  verifyLpBurnTransaction,
  PoolVerificationError,
} from "../raydium-pool-service";

function keypair(seed: number): PublicKey {
  return Keypair.fromSeed(new Uint8Array(32).fill(seed)).publicKey;
}

interface FakeTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

function fakeConnection(tx: unknown) {
  return { getTransaction: vi.fn().mockResolvedValue(tx) } as any;
}

function buildFakeTx(params: {
  accountKeys: PublicKey[];
  signerIndexes: number[];
  err?: unknown;
  preTokenBalances?: FakeTokenBalance[];
  postTokenBalances?: FakeTokenBalance[];
}) {
  return {
    meta: {
      err: params.err ?? null,
      preTokenBalances: params.preTokenBalances ?? [],
      postTokenBalances: params.postTokenBalances ?? [],
    },
    transaction: {
      message: {
        getAccountKeys: () => ({ staticAccountKeys: params.accountKeys }),
        isAccountSigner: (index: number) => params.signerIndexes.includes(index),
      },
    },
  };
}

describe("verifyPoolCreationTransaction", () => {
  const tokenMint = keypair(1);
  const quoteMint = keypair(2);
  const creator = keypair(3);
  const keys = deriveCreatePoolKeys(tokenMint, TOKEN_PROGRAM_ID, quoteMint);

  const baseParams = {
    tokenMintAddress: tokenMint.toBase58(),
    tokenProgramId: TOKEN_PROGRAM_ID.toBase58(),
    quoteMintAddress: quoteMint.toBase58(),
    creatorWalletAddress: creator.toBase58(),
  };

  function happyPathTx() {
    const accountKeys = [creator, CREATE_CPMM_POOL_PROGRAM, keys.poolId, keys.vaultA, keys.vaultB];
    return buildFakeTx({
      accountKeys,
      signerIndexes: [0],
      preTokenBalances: [],
      postTokenBalances: [
        { accountIndex: 3, mint: keys.mintA.toBase58(), uiTokenAmount: { amount: "1000000" } },
        { accountIndex: 4, mint: keys.mintB.toBase58(), uiTokenAmount: { amount: "2000000" } },
      ],
    });
  }

  it("verifies a genuine pool-creation transaction and returns the real seeded amounts", async () => {
    const result = await verifyPoolCreationTransaction(fakeConnection(happyPathTx()), "sig1", baseParams);
    expect(result.poolId).toBe(keys.poolId.toBase58());
    expect(BigInt(result.baseMintAmountRaw)).toBe(BigInt(1_000_000));
    expect(BigInt(result.quoteMintAmountRaw)).toBe(BigInt(2_000_000));
  });

  it("reports NOT_FOUND_YET (not a hard failure) when the RPC hasn't seen the signature", async () => {
    const connection = fakeConnection(null);
    await expect(verifyPoolCreationTransaction(connection, "sig1", baseParams)).rejects.toMatchObject({
      status: "NOT_FOUND_YET",
    });
  });

  it("rejects a transaction that failed on-chain", async () => {
    const tx = buildFakeTx({ accountKeys: [creator], signerIndexes: [0], err: { InstructionError: [0, "Custom"] } });
    await expect(verifyPoolCreationTransaction(fakeConnection(tx), "sig1", baseParams)).rejects.toBeInstanceOf(
      PoolVerificationError
    );
  });

  it("rejects when the claimed creator wallet never signed the transaction", async () => {
    const accountKeys = [creator, CREATE_CPMM_POOL_PROGRAM, keys.poolId, keys.vaultA, keys.vaultB];
    const tx = buildFakeTx({ accountKeys, signerIndexes: [] /* creator did NOT sign */ });
    await expect(verifyPoolCreationTransaction(fakeConnection(tx), "sig1", baseParams)).rejects.toThrow(
      /did not sign/
    );
  });

  it("rejects a transaction for a completely different pool (an attempted replay against an unrelated transaction)", async () => {
    const unrelatedTx = buildFakeTx({ accountKeys: [creator, CREATE_CPMM_POOL_PROGRAM], signerIndexes: [0] });
    await expect(verifyPoolCreationTransaction(fakeConnection(unrelatedTx), "sig1", baseParams)).rejects.toThrow(
      /pool account/
    );
  });

  it("rejects when the pool's vaults were not actually seeded with positive liquidity", async () => {
    const accountKeys = [creator, CREATE_CPMM_POOL_PROGRAM, keys.poolId, keys.vaultA, keys.vaultB];
    const tx = buildFakeTx({
      accountKeys,
      signerIndexes: [0],
      postTokenBalances: [
        { accountIndex: 3, mint: keys.mintA.toBase58(), uiTokenAmount: { amount: "0" } },
        { accountIndex: 4, mint: keys.mintB.toBase58(), uiTokenAmount: { amount: "0" } },
      ],
    });
    await expect(verifyPoolCreationTransaction(fakeConnection(tx), "sig1", baseParams)).rejects.toThrow(
      /not seeded/
    );
  });
});

describe("verifyLiquidityTransaction", () => {
  const poolId = keypair(10);
  const vaultA = keypair(11);
  const vaultB = keypair(12);
  const lpMint = keypair(13);
  const wallet = keypair(14);
  const lpAccount = keypair(15);

  function buildEventTx(params: { baseDelta: bigint; quoteDelta: bigint; lpDelta: bigint }) {
    const accountKeys = [wallet, CREATE_CPMM_POOL_PROGRAM, poolId, vaultA, vaultB, lpAccount];
    return buildFakeTx({
      accountKeys,
      signerIndexes: [0],
      preTokenBalances: [
        { accountIndex: 3, mint: "A", uiTokenAmount: { amount: "1000" } },
        { accountIndex: 4, mint: "B", uiTokenAmount: { amount: "2000" } },
        { accountIndex: 5, mint: lpMint.toBase58(), owner: wallet.toBase58(), uiTokenAmount: { amount: "500" } },
      ],
      postTokenBalances: [
        { accountIndex: 3, mint: "A", uiTokenAmount: { amount: String(BigInt(1000) + params.baseDelta) } },
        { accountIndex: 4, mint: "B", uiTokenAmount: { amount: String(BigInt(2000) + params.quoteDelta) } },
        {
          accountIndex: 5,
          mint: lpMint.toBase58(),
          owner: wallet.toBase58(),
          uiTokenAmount: { amount: String(BigInt(500) + params.lpDelta) },
        },
      ],
    });
  }

  const baseParams = {
    poolId: poolId.toBase58(),
    vaultA: vaultA.toBase58(),
    vaultB: vaultB.toBase58(),
    lpMint: lpMint.toBase58(),
    walletAddress: wallet.toBase58(),
  };

  it("verifies a real ADD (both vaults up, LP minted) and returns real magnitudes", async () => {
    const tx = buildEventTx({ baseDelta: BigInt(100), quoteDelta: BigInt(200), lpDelta: BigInt(50) });
    const result = await verifyLiquidityTransaction(fakeConnection(tx), "sig1", { ...baseParams, type: "ADD" });
    expect(result.baseAmountRaw).toBe(BigInt(100));
    expect(result.quoteAmountRaw).toBe(BigInt(200));
    expect(result.lpAmountRaw).toBe(BigInt(50));
  });

  it("verifies a real REMOVE (both vaults down, LP burned)", async () => {
    const tx = buildEventTx({ baseDelta: BigInt(-100), quoteDelta: BigInt(-200), lpDelta: BigInt(-50) });
    const result = await verifyLiquidityTransaction(fakeConnection(tx), "sig1", { ...baseParams, type: "REMOVE" });
    expect(result.baseAmountRaw).toBe(BigInt(100));
    expect(result.lpAmountRaw).toBe(BigInt(50));
  });

  it("rejects an ADD claim where the vaults actually moved like a REMOVE (a client lying about direction)", async () => {
    const tx = buildEventTx({ baseDelta: BigInt(-100), quoteDelta: BigInt(-200), lpDelta: BigInt(-50) });
    await expect(
      verifyLiquidityTransaction(fakeConnection(tx), "sig1", { ...baseParams, type: "ADD" })
    ).rejects.toThrow(/direction expected/);
  });

  it("rejects a transaction that never touched the wallet's LP account at all", async () => {
    const accountKeys = [wallet, CREATE_CPMM_POOL_PROGRAM, poolId, vaultA, vaultB];
    const tx = buildFakeTx({
      accountKeys,
      signerIndexes: [0],
      preTokenBalances: [
        { accountIndex: 3, mint: "A", uiTokenAmount: { amount: "1000" } },
        { accountIndex: 4, mint: "B", uiTokenAmount: { amount: "2000" } },
      ],
      postTokenBalances: [
        { accountIndex: 3, mint: "A", uiTokenAmount: { amount: "1100" } },
        { accountIndex: 4, mint: "B", uiTokenAmount: { amount: "2200" } },
      ],
    });
    await expect(
      verifyLiquidityTransaction(fakeConnection(tx), "sig1", { ...baseParams, type: "ADD" })
    ).rejects.toThrow(/LP token account/);
  });
});

describe("verifyLpBurnTransaction", () => {
  const lpMint = keypair(20);
  const wallet = keypair(21);
  const lpAccount = keypair(22);

  it("confirms a genuine burn and returns the real burned amount", async () => {
    const accountKeys = [wallet, lpAccount];
    const tx = buildFakeTx({
      accountKeys,
      signerIndexes: [0],
      preTokenBalances: [
        { accountIndex: 1, mint: lpMint.toBase58(), owner: wallet.toBase58(), uiTokenAmount: { amount: "1000" } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: lpMint.toBase58(), owner: wallet.toBase58(), uiTokenAmount: { amount: "0" } },
      ],
    });
    const result = await verifyLpBurnTransaction(fakeConnection(tx), "sig1", {
      lpMint: lpMint.toBase58(),
      walletAddress: wallet.toBase58(),
    });
    expect(result.lpAmountRaw).toBe(BigInt(1000));
  });

  it("rejects a transaction where the LP balance did not actually decrease", async () => {
    const accountKeys = [wallet, lpAccount];
    const tx = buildFakeTx({
      accountKeys,
      signerIndexes: [0],
      preTokenBalances: [
        { accountIndex: 1, mint: lpMint.toBase58(), owner: wallet.toBase58(), uiTokenAmount: { amount: "1000" } },
      ],
      postTokenBalances: [
        { accountIndex: 1, mint: lpMint.toBase58(), owner: wallet.toBase58(), uiTokenAmount: { amount: "1000" } },
      ],
    });
    await expect(
      verifyLpBurnTransaction(fakeConnection(tx), "sig1", { lpMint: lpMint.toBase58(), walletAddress: wallet.toBase58() })
    ).rejects.toThrow(/No LP tokens/);
  });

  it("rejects when the claimed wallet never signed", async () => {
    const accountKeys = [wallet, lpAccount];
    const tx = buildFakeTx({ accountKeys, signerIndexes: [] });
    await expect(
      verifyLpBurnTransaction(fakeConnection(tx), "sig1", { lpMint: lpMint.toBase58(), walletAddress: wallet.toBase58() })
    ).rejects.toThrow(/did not sign/);
  });
});
