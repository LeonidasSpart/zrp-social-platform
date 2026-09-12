import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

/*
 * Unit coverage for verifyUsdcTransaction() - the single on-chain
 * verification function every crypto-payment route (tip, premium
 * purchase, HELP contribution) relies on. Connection.getTransaction is
 * mocked (no real RPC call, per the task's "do not hit the real
 * provider" instruction); PublicKey/getAssociatedTokenAddress are pure
 * derivations with no network I/O, so they run for real - this proves
 * the actual account-matching logic, not a stand-in for it.
 *
 * Fabricated keypairs only. No real wallet, mint, or RPC secret
 * appears anywhere in this file.
 */
const { mockGetTransaction } = vi.hoisted(() => ({
  mockGetTransaction: vi.fn(),
}));

vi.mock("@solana/web3.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@solana/web3.js")>();
  return {
    ...actual,
    // A real constructor function, not an arrow function - arrow
    // functions can never be invoked with `new`, which is exactly how
    // solana.ts's getConnection() creates its Connection instance.
    Connection: vi.fn().mockImplementation(function (this: unknown) {
      return { getTransaction: mockGetTransaction };
    }),
  };
});

const USDC_MINT = Keypair.generate().publicKey;
const OTHER_MINT = Keypair.generate().publicKey; // stands in for a non-USDC token
const PLATFORM_WALLET = Keypair.generate().publicKey;
const SENDER_OWNER = Keypair.generate().publicKey;
const ATTACKER_WALLET = Keypair.generate().publicKey; // an unrelated wallet, never the sender

let PLATFORM_ATA: PublicKey;

const originalEnv = { ...process.env };

beforeEach(async () => {
  vi.resetModules();
  mockGetTransaction.mockReset();
  process.env.NEXT_PUBLIC_USDC_MINT = USDC_MINT.toBase58();
  process.env.NEXT_PUBLIC_PLATFORM_WALLET = PLATFORM_WALLET.toBase58();
  process.env.SOLANA_RPC_URL = "https://example-fake-rpc.invalid";
  PLATFORM_ATA = await getAssociatedTokenAddress(USDC_MINT, PLATFORM_WALLET);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// Builds a minimal fake `getTransaction` response shape - just enough of
// the real Solana RPC response for verifyUsdcTransaction's own reads
// (tx.meta.err, pre/postTokenBalances, the account-keys list) to exercise
// it faithfully, without a live connection.
function fakeTx(opts: {
  err?: unknown;
  accountKeys: PublicKey[];
  preTokenBalances: Array<{ accountIndex: number; mint: string; owner?: string; uiAmount: number }>;
  postTokenBalances: Array<{ accountIndex: number; mint: string; owner?: string; uiAmount: number }>;
}) {
  return {
    meta: {
      err: opts.err ?? null,
      preTokenBalances: opts.preTokenBalances.map((b) => ({
        accountIndex: b.accountIndex,
        mint: b.mint,
        owner: b.owner,
        uiTokenAmount: { uiAmount: b.uiAmount },
      })),
      postTokenBalances: opts.postTokenBalances.map((b) => ({
        accountIndex: b.accountIndex,
        mint: b.mint,
        owner: b.owner,
        uiTokenAmount: { uiAmount: b.uiAmount },
      })),
    },
    transaction: {
      message: {
        getAccountKeys: () => ({ staticAccountKeys: opts.accountKeys }),
      },
    },
  };
}

describe("verifyUsdcTransaction", () => {
  it("[nonexistent transaction] throws when the RPC has no record of the signature", async () => {
    mockGetTransaction.mockResolvedValue(null);
    const { verifyUsdcTransaction } = await import("../solana");
    await expect(verifyUsdcTransaction("some-signature")).rejects.toThrow(/not found/i);
  });

  it("[malformed / failed transaction] throws when the transaction itself errored on-chain", async () => {
    mockGetTransaction.mockResolvedValue({
      meta: { err: { InstructionError: [0, "Custom"] } },
      transaction: { message: { getAccountKeys: () => ({ staticAccountKeys: [] }) } },
    });
    const { verifyUsdcTransaction } = await import("../solana");
    await expect(verifyUsdcTransaction("failed-sig")).rejects.toThrow(/failed/i);
  });

  it("[wrong recipient] throws when the platform's USDC account is never credited", async () => {
    // A real USDC transfer, but to some other account entirely - not the
    // platform's associated token account.
    const someoneElseAta = Keypair.generate().publicKey;
    mockGetTransaction.mockResolvedValue(
      fakeTx({
        accountKeys: [SENDER_OWNER, someoneElseAta],
        preTokenBalances: [{ accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 0 }],
        postTokenBalances: [{ accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 10 }],
      })
    );
    const { verifyUsdcTransaction } = await import("../solana");
    await expect(verifyUsdcTransaction("wrong-recipient-sig")).rejects.toThrow(/did not credit the platform/i);
  });

  it("[wrong token/mint] throws when the credited token is not the configured USDC mint, even if the client claims it is", async () => {
    // A transfer of a *different* token straight into the platform's
    // (USDC) ATA index - the mint field on the balance entry is what
    // must decide this, not the client's say-so.
    mockGetTransaction.mockResolvedValue(
      fakeTx({
        accountKeys: [SENDER_OWNER, PLATFORM_ATA],
        preTokenBalances: [{ accountIndex: 1, mint: OTHER_MINT.toBase58(), uiAmount: 0 }],
        postTokenBalances: [{ accountIndex: 1, mint: OTHER_MINT.toBase58(), uiAmount: 10 }],
      })
    );
    const { verifyUsdcTransaction } = await import("../solana");
    await expect(verifyUsdcTransaction("wrong-mint-sig")).rejects.toThrow(/did not credit the platform/i);
  });

  it("[wrong amount / no transfer] throws when the platform's balance did not actually increase", async () => {
    mockGetTransaction.mockResolvedValue(
      fakeTx({
        accountKeys: [SENDER_OWNER, PLATFORM_ATA],
        preTokenBalances: [{ accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 10 }],
        postTokenBalances: [{ accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 10 }],
      })
    );
    const { verifyUsdcTransaction } = await import("../solana");
    await expect(verifyUsdcTransaction("zero-amount-sig")).rejects.toThrow(/no positive usdc transfer/i);
  });

  it("[valid payment] returns the real on-chain amount and recipient, independent of any client claim", async () => {
    mockGetTransaction.mockResolvedValue(
      fakeTx({
        accountKeys: [SENDER_OWNER, PLATFORM_ATA],
        preTokenBalances: [
          { accountIndex: 0, mint: USDC_MINT.toBase58(), owner: SENDER_OWNER.toBase58(), uiAmount: 100 },
          { accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 0 },
        ],
        postTokenBalances: [
          { accountIndex: 0, mint: USDC_MINT.toBase58(), owner: SENDER_OWNER.toBase58(), uiAmount: 75 },
          { accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 25 },
        ],
      })
    );
    const { verifyUsdcTransaction } = await import("../solana");
    const result = await verifyUsdcTransaction("valid-sig");

    expect(result.valid).toBe(true);
    expect(result.amount).toBe(25);
    expect(result.to).toBe(PLATFORM_WALLET.toBase58());
    // Sender identity is derived from whose balance actually decreased -
    // never from a client-supplied field, since none is accepted here.
    expect(result.from).toBe(SENDER_OWNER.toBase58());
  });

  it("[sender identity cannot be spoofed by transaction shape] an unrelated wallet mentioned in the transaction, whose balance did not move, is never reported as the sender", async () => {
    mockGetTransaction.mockResolvedValue(
      fakeTx({
        accountKeys: [SENDER_OWNER, PLATFORM_ATA, ATTACKER_WALLET],
        preTokenBalances: [
          { accountIndex: 0, mint: USDC_MINT.toBase58(), owner: SENDER_OWNER.toBase58(), uiAmount: 100 },
          { accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 0 },
          // The attacker's own token account is present in the tx (e.g. as
          // a fee payer or unrelated instruction party) but its balance
          // never changes.
          { accountIndex: 2, mint: USDC_MINT.toBase58(), owner: ATTACKER_WALLET.toBase58(), uiAmount: 5 },
        ],
        postTokenBalances: [
          { accountIndex: 0, mint: USDC_MINT.toBase58(), owner: SENDER_OWNER.toBase58(), uiAmount: 90 },
          { accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 10 },
          { accountIndex: 2, mint: USDC_MINT.toBase58(), owner: ATTACKER_WALLET.toBase58(), uiAmount: 5 },
        ],
      })
    );
    const { verifyUsdcTransaction } = await import("../solana");
    const result = await verifyUsdcTransaction("multi-party-sig");
    expect(result.from).toBe(SENDER_OWNER.toBase58());
    expect(result.from).not.toBe(ATTACKER_WALLET.toBase58());
  });

  it("[network isolation] only ever queries the single server-configured RPC endpoint - a caller cannot choose the network", async () => {
    const { verifyUsdcTransaction } = await import("../solana");
    mockGetTransaction.mockResolvedValue(
      fakeTx({
        accountKeys: [SENDER_OWNER, PLATFORM_ATA],
        preTokenBalances: [{ accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 0 }],
        postTokenBalances: [{ accountIndex: 1, mint: USDC_MINT.toBase58(), uiAmount: 5 }],
      })
    );
    // verifyUsdcTransaction's signature takes only a signature string -
    // there is no network/cluster parameter for a caller to influence.
    expect(verifyUsdcTransaction.length).toBe(1);
    await verifyUsdcTransaction("sig");
    expect(mockGetTransaction).toHaveBeenCalledWith("sig", expect.objectContaining({ commitment: "confirmed" }));
  });
});
