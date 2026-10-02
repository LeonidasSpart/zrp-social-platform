import { describe, it, expect, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { OFFLINE_PUMP_AMM_PROGRAM } from "@pump-fun/pump-swap-sdk";
import { getPumpSwapPoolState } from "../pumpswap-pool-service";

/*
 * Pool is small (POOL_SIZE = 270 bytes, well under Anchor's buggy
 * hardcoded 1000-byte encode() buffer that forced the manual-encode
 * workaround elsewhere in this mission for the much larger Global
 * account) - the public coder.accounts.encode() API works fine here.
 */
async function encodePool(fields: {
  poolBump?: number;
  index?: number;
  creator?: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  lpMint: PublicKey;
  poolBaseTokenAccount: PublicKey;
  poolQuoteTokenAccount: PublicKey;
  lpSupply?: BN;
  coinCreator?: PublicKey;
  isMayhemMode?: boolean;
  isCashbackCoin?: boolean;
  virtualQuoteReserves?: BN;
  creatorFeeBps?: BN;
  canEditCreatorFee?: boolean;
}): Promise<Buffer> {
  const data = {
    poolBump: fields.poolBump ?? 255,
    index: fields.index ?? 0,
    creator: fields.creator ?? PublicKey.default,
    baseMint: fields.baseMint,
    quoteMint: fields.quoteMint,
    lpMint: fields.lpMint,
    poolBaseTokenAccount: fields.poolBaseTokenAccount,
    poolQuoteTokenAccount: fields.poolQuoteTokenAccount,
    lpSupply: fields.lpSupply ?? new BN(0),
    coinCreator: fields.coinCreator ?? PublicKey.default,
    isMayhemMode: fields.isMayhemMode ?? false,
    isCashbackCoin: fields.isCashbackCoin ?? false,
    virtualQuoteReserves: fields.virtualQuoteReserves ?? new BN(0),
    creatorFeeBps: fields.creatorFeeBps ?? new BN(0),
    canEditCreatorFee: fields.canEditCreatorFee ?? false,
  };
  return OFFLINE_PUMP_AMM_PROGRAM.coder.accounts.encode("pool", data);
}

function fakeMintAccount(): PublicKey {
  return Keypair.generate().publicKey;
}

function tokenAccountInfo(mint: PublicKey, owner: PublicKey, amount: bigint): { data: Buffer } {
  // Minimal 72-byte SPL Token account layout prefix: mint (32) + owner (32) + amount (8).
  const data = Buffer.alloc(165);
  mint.toBuffer().copy(data, 0);
  owner.toBuffer().copy(data, 32);
  data.writeBigUInt64LE(amount, 64);
  return { data };
}

describe("getPumpSwapPoolState", () => {
  const poolAddress = Keypair.generate().publicKey;
  const baseMint = fakeMintAccount();
  const quoteMint = fakeMintAccount();
  const lpMint = fakeMintAccount();
  const baseVault = fakeMintAccount();
  const quoteVault = fakeMintAccount();

  function connectionFor(opts: { poolData: Buffer | null; baseAmount?: bigint; quoteAmount?: bigint; lpSupply?: bigint }) {
    return {
      getAccountInfo: vi.fn(async (pubkey: PublicKey) => {
        if (pubkey.equals(poolAddress)) {
          return opts.poolData ? { data: opts.poolData } : null;
        }
        return null;
      }),
      getTokenAccountBalance: vi.fn(async (pubkey: PublicKey) => {
        if (pubkey.equals(baseVault)) return { value: { amount: (opts.baseAmount ?? BigInt(0)).toString() } };
        if (pubkey.equals(quoteVault)) return { value: { amount: (opts.quoteAmount ?? BigInt(0)).toString() } };
        throw new Error("unexpected token account");
      }),
      getTokenSupply: vi.fn(async () => ({ value: { amount: (opts.lpSupply ?? BigInt(0)).toString() } })),
    } as any;
  }

  it("reports NOT_FOUND when the pool account does not exist yet (migration hasn't landed)", async () => {
    const connection = connectionFor({ poolData: null });
    const result = await getPumpSwapPoolState(connection, poolAddress.toBase58());
    expect(result.status).toBe("NOT_FOUND");
  });

  it("reports UNAVAILABLE (never a fabricated price) when the RPC call fails", async () => {
    const connection = { getAccountInfo: vi.fn().mockRejectedValue(new Error("rpc timeout")) } as any;
    const result = await getPumpSwapPoolState(connection, poolAddress.toBase58());
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.priceDisplay).toBeNull();
  });

  it("decodes real reserves and computes price as (quote reserve + virtualQuoteReserves) / base reserve", async () => {
    const poolData = await encodePool({
      baseMint,
      quoteMint,
      lpMint,
      poolBaseTokenAccount: baseVault,
      poolQuoteTokenAccount: quoteVault,
      virtualQuoteReserves: new BN("1000000"),
      lpSupply: new BN("500000"),
    });
    const connection = connectionFor({ poolData, baseAmount: BigInt(1_000_000), quoteAmount: BigInt(2_000_000), lpSupply: BigInt(500_000) });
    const result = await getPumpSwapPoolState(connection, poolAddress.toBase58());

    expect(result.status).toBe("OK");
    expect(result.baseMint).toBe(baseMint.toBase58());
    expect(result.quoteMint).toBe(quoteMint.toBase58());
    expect(result.lpMint).toBe(lpMint.toBase58());
    expect(result.baseReserveRaw).toBe("1000000");
    expect(result.quoteReserveRaw).toBe("2000000");
    expect(result.virtualQuoteReservesRaw).toBe("1000000");
    // effective quote = 2_000_000 + 1_000_000 = 3_000_000; price = 3_000_000 / 1_000_000 = 3
    expect(result.priceDisplay).toBe("3");
  });

  it("decodes a pool with zero virtual quote reserves (price is the plain reserve ratio)", async () => {
    const poolData = await encodePool({
      baseMint,
      quoteMint,
      lpMint,
      poolBaseTokenAccount: baseVault,
      poolQuoteTokenAccount: quoteVault,
    });
    const connection = connectionFor({ poolData, baseAmount: BigInt(2_000_000), quoteAmount: BigInt(1_000_000) });
    const result = await getPumpSwapPoolState(connection, poolAddress.toBase58());
    expect(result.status).toBe("OK");
    expect(result.priceDisplay).toBe("0.5");
  });
});
