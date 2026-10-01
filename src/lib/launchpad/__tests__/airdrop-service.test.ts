import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

const { getConnection } = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock("@/lib/solana", () => ({ getConnection }));

import { buildAirdropBatchTransaction, verifyAirdropBatchTransaction } from "../airdrop-service";

/*
 * buildAirdropBatchTransaction: pure instruction-construction tests, same
 * rationale as client-token-mint.test.ts's buildBrowserMintTransaction
 * tests - zrppad's own airdrop never created the recipient's ATA before
 * transferring into it, which fails on-chain for any recipient who
 * doesn't already hold the token. The one thing that actually matters
 * here is that every transfer is preceded by an idempotent create-ATA
 * instruction paid by the sender.
 */
describe("buildAirdropBatchTransaction", () => {
  it("sets the sender as fee payer", () => {
    const sender = Keypair.generate();
    const mint = Keypair.generate();
    const recipient = Keypair.generate();
    const tx = buildAirdropBatchTransaction({
      senderPubkey: sender.publicKey,
      mintPubkey: mint.publicKey,
      recipients: [{ walletAddress: recipient.publicKey.toBase58() }],
      amountPerRecipientRaw: BigInt(1000),
      decimals: 9,
    });
    expect(tx.feePayer?.equals(sender.publicKey)).toBe(true);
  });

  it("precedes every transfer with an idempotent create-ATA instruction for that recipient", () => {
    const sender = Keypair.generate();
    const mint = Keypair.generate();
    const recipient = Keypair.generate();
    const recipientAta = getAssociatedTokenAddressSync(mint.publicKey, recipient.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

    const tx = buildAirdropBatchTransaction({
      senderPubkey: sender.publicKey,
      mintPubkey: mint.publicKey,
      recipients: [{ walletAddress: recipient.publicKey.toBase58() }],
      amountPerRecipientRaw: BigInt(1000),
      decimals: 9,
    });

    const createAtaIndex = tx.instructions.findIndex(
      (ix) => ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) && ix.keys.some((k) => k.pubkey.equals(recipientAta))
    );
    const transferIndex = tx.instructions.findIndex(
      (ix) => ix.programId.equals(TOKEN_PROGRAM_ID) && ix.keys.some((k) => k.pubkey.equals(recipientAta))
    );
    expect(createAtaIndex).toBeGreaterThanOrEqual(0);
    expect(transferIndex).toBeGreaterThan(createAtaIndex);
  });

  it("builds two create-ATA + transfer pairs for two recipients, each addressed to its own ATA", () => {
    const sender = Keypair.generate();
    const mint = Keypair.generate();
    const recipientA = Keypair.generate();
    const recipientB = Keypair.generate();

    const tx = buildAirdropBatchTransaction({
      senderPubkey: sender.publicKey,
      mintPubkey: mint.publicKey,
      recipients: [{ walletAddress: recipientA.publicKey.toBase58() }, { walletAddress: recipientB.publicKey.toBase58() }],
      amountPerRecipientRaw: BigInt(500),
      decimals: 6,
    });

    expect(tx.instructions).toHaveLength(4); // 2 x (create-ATA + transfer)

    const ataA = getAssociatedTokenAddressSync(mint.publicKey, recipientA.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const ataB = getAssociatedTokenAddressSync(mint.publicKey, recipientB.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    expect(tx.instructions.some((ix) => ix.keys.some((k) => k.pubkey.equals(ataA)))).toBe(true);
    expect(tx.instructions.some((ix) => ix.keys.some((k) => k.pubkey.equals(ataB)))).toBe(true);
  });

  it("sends from the sender's own ATA, not the recipient's", () => {
    const sender = Keypair.generate();
    const mint = Keypair.generate();
    const recipient = Keypair.generate();
    const senderAta = getAssociatedTokenAddressSync(mint.publicKey, sender.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

    const tx = buildAirdropBatchTransaction({
      senderPubkey: sender.publicKey,
      mintPubkey: mint.publicKey,
      recipients: [{ walletAddress: recipient.publicKey.toBase58() }],
      amountPerRecipientRaw: BigInt(1000),
      decimals: 9,
    });

    const transferIx = tx.instructions.find((ix) => ix.programId.equals(TOKEN_PROGRAM_ID));
    expect(transferIx?.keys.some((k) => k.pubkey.equals(senderAta))).toBe(true);
  });
});

/*
 * verifyAirdropBatchTransaction: the actual trust boundary - never
 * record a client-claimed "success" as-is. Verification re-derives
 * owner-level token balance deltas from the transaction's own metadata,
 * the same technique spl-transfer-verify.ts uses for payment-in
 * verification (pre/post token balance diffing), generalized to
 * arbitrary recipients instead of a single platform destination.
 */
describe("verifyAirdropBatchTransaction", () => {
  const MINT = "DNmzBN39w3VfVbhExixi1b2UGJ9MbxoYJqoasuFyAKrt";
  const SENDER = "SenderWallet1111111111111111111111111111";
  const RECIPIENT_A = "RecipientWalletAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const RECIPIENT_B = "RecipientWalletBBBBBBBBBBBBBBBBBBBBBBBBBBB";

  function mockTx(overrides: { err?: unknown; preTokenBalances?: unknown[]; postTokenBalances?: unknown[] } = {}) {
    getConnection.mockReturnValue({
      getTransaction: vi.fn().mockResolvedValue({
        meta: {
          err: overrides.err ?? null,
          preTokenBalances: overrides.preTokenBalances ?? [],
          postTokenBalances: overrides.postTokenBalances ?? [],
        },
      }),
    });
  }

  function balance(accountIndex: number, owner: string, amount: string) {
    return { accountIndex, mint: MINT, owner, uiTokenAmount: { amount } };
  }

  beforeEach(() => {
    getConnection.mockReset();
  });

  it("verifies a single recipient credited by exactly the expected amount", async () => {
    mockTx({
      preTokenBalances: [balance(0, SENDER, "10000"), balance(1, RECIPIENT_A, "0")],
      postTokenBalances: [balance(0, SENDER, "9000"), balance(1, RECIPIENT_A, "1000")],
    });

    const result = await verifyAirdropBatchTransaction({
      transactionId: "sig1",
      mintAddress: MINT,
      senderWalletAddress: SENDER,
      amountPerRecipientRaw: BigInt(1000),
      claimedRecipientWallets: [RECIPIENT_A],
    });

    expect(result.verifiedRecipients).toEqual([{ walletAddress: RECIPIENT_A, rawAmount: BigInt(1000) }]);
  });

  it("verifies multiple recipients in one batch", async () => {
    mockTx({
      preTokenBalances: [balance(0, SENDER, "10000")],
      postTokenBalances: [balance(0, SENDER, "8000"), balance(1, RECIPIENT_A, "1000"), balance(2, RECIPIENT_B, "1000")],
    });

    const result = await verifyAirdropBatchTransaction({
      transactionId: "sig2",
      mintAddress: MINT,
      senderWalletAddress: SENDER,
      amountPerRecipientRaw: BigInt(1000),
      claimedRecipientWallets: [RECIPIENT_A, RECIPIENT_B],
    });

    expect(result.verifiedRecipients).toHaveLength(2);
    expect(result.verifiedRecipients.map((r) => r.walletAddress).sort()).toEqual([RECIPIENT_A, RECIPIENT_B].sort());
  });

  it("throws when the transaction is not found - never fabricates a result", async () => {
    getConnection.mockReturnValue({ getTransaction: vi.fn().mockResolvedValue(null) });
    await expect(
      verifyAirdropBatchTransaction({
        transactionId: "missing",
        mintAddress: MINT,
        senderWalletAddress: SENDER,
        amountPerRecipientRaw: BigInt(1000),
        claimedRecipientWallets: [RECIPIENT_A],
      })
    ).rejects.toThrow("Transaction not found");
  });

  it("throws when the transaction failed on-chain", async () => {
    mockTx({ err: { InstructionError: [0, "Custom"] } });
    await expect(
      verifyAirdropBatchTransaction({
        transactionId: "sig3",
        mintAddress: MINT,
        senderWalletAddress: SENDER,
        amountPerRecipientRaw: BigInt(1000),
        claimedRecipientWallets: [RECIPIENT_A],
      })
    ).rejects.toThrow("Transaction failed");
  });

  it("throws when the claimed sender's balance was never debited (a real sender was never involved)", async () => {
    mockTx({
      preTokenBalances: [balance(0, RECIPIENT_A, "0")],
      postTokenBalances: [balance(0, RECIPIENT_A, "1000")],
    });
    await expect(
      verifyAirdropBatchTransaction({
        transactionId: "sig4",
        mintAddress: MINT,
        senderWalletAddress: SENDER,
        amountPerRecipientRaw: BigInt(1000),
        claimedRecipientWallets: [RECIPIENT_A],
      })
    ).rejects.toThrow("did not debit");
  });

  it("excludes a claimed recipient whose actual on-chain delta doesn't match the expected amount, rather than trusting the claim", async () => {
    mockTx({
      preTokenBalances: [balance(0, SENDER, "10000"), balance(1, RECIPIENT_A, "0")],
      // Recipient A only actually got 1 unit, not the claimed 1000.
      postTokenBalances: [balance(0, SENDER, "9999"), balance(1, RECIPIENT_A, "1")],
    });

    await expect(
      verifyAirdropBatchTransaction({
        transactionId: "sig5",
        mintAddress: MINT,
        senderWalletAddress: SENDER,
        amountPerRecipientRaw: BigInt(1000),
        claimedRecipientWallets: [RECIPIENT_A],
      })
    ).rejects.toThrow("None of the claimed recipients were credited");
  });

  it("throws if the credited recipients exceed what the sender's wallet actually sent", async () => {
    // Both recipients show the exact expected credit, but the sender's
    // own balance only dropped by one recipient's worth - the chain
    // doesn't actually support attributing both transfers to this sender.
    mockTx({
      preTokenBalances: [balance(0, SENDER, "10000")],
      postTokenBalances: [balance(0, SENDER, "9000"), balance(1, RECIPIENT_A, "1000"), balance(2, RECIPIENT_B, "1000")],
    });

    await expect(
      verifyAirdropBatchTransaction({
        transactionId: "sig6",
        mintAddress: MINT,
        senderWalletAddress: SENDER,
        amountPerRecipientRaw: BigInt(1000),
        claimedRecipientWallets: [RECIPIENT_A, RECIPIENT_B],
      })
    ).rejects.toThrow("exceed what the sender");
  });
});
