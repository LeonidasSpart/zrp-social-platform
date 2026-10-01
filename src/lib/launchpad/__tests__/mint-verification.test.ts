import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

/*
 * Unit coverage for verifyTransactionCreatedMint - the check that closes
 * the "replay a real fee payment against an unrelated pre-existing mint"
 * gap (see mint-verification.ts's own comment). getConnection is mocked
 * with a hand-built transaction response so this never touches a real
 * RPC; scanTokenOnChain (a thin retry wrapper over the already-tested
 * token-scanner.ts) is exercised separately via its own retry behaviour.
 */
const { getConnection } = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock("@/lib/solana", () => ({ getConnection }));

import { verifyTransactionCreatedMint } from "../mint-verification";

function buildCreateAccountTransaction(newAccount: Keypair, owner = TOKEN_PROGRAM_ID) {
  const payer = Keypair.generate();
  const tx = new Transaction();
  tx.feePayer = payer.publicKey;
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: newAccount.publicKey,
      space: 82,
      lamports: 1_461_600,
      programId: owner,
    })
  );
  tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
  tx.partialSign(payer, newAccount);

  const compiled = tx.compileMessage();
  return {
    meta: { err: null },
    transaction: {
      message: {
        getAccountKeys: () => ({ staticAccountKeys: compiled.accountKeys }),
        compiledInstructions: compiled.instructions.map((ix) => ({
          programIdIndex: ix.programIdIndex,
          accountKeyIndexes: ix.accounts,
          // Legacy Message.compileMessage()'s CompiledInstruction.data is
          // base58-encoded (web3.js's on-wire convention), not base64.
          data: bs58.decode(ix.data) as unknown as Uint8Array,
        })),
      },
    },
  };
}

describe("verifyTransactionCreatedMint", () => {
  beforeEach(() => {
    getConnection.mockReset();
  });

  it("returns true when the transaction created exactly this mint account", async () => {
    const mint = Keypair.generate();
    const txResponse = buildCreateAccountTransaction(mint);
    getConnection.mockReturnValue({ getTransaction: vi.fn().mockResolvedValue(txResponse) });

    const result = await verifyTransactionCreatedMint("sig123", mint.publicKey.toBase58());
    expect(result).toBe(true);
  });

  it("returns false when the transaction created a DIFFERENT account than the claimed mint", async () => {
    const mint = Keypair.generate();
    const unrelated = Keypair.generate();
    const txResponse = buildCreateAccountTransaction(unrelated);
    getConnection.mockReturnValue({ getTransaction: vi.fn().mockResolvedValue(txResponse) });

    const result = await verifyTransactionCreatedMint("sig123", mint.publicKey.toBase58());
    expect(result).toBe(false);
  });

  it("returns false when the created account isn't owned by the Token Program (not actually a mint)", async () => {
    const mint = Keypair.generate();
    const txResponse = buildCreateAccountTransaction(mint, SystemProgram.programId);
    getConnection.mockReturnValue({ getTransaction: vi.fn().mockResolvedValue(txResponse) });

    const result = await verifyTransactionCreatedMint("sig123", mint.publicKey.toBase58());
    expect(result).toBe(false);
  });

  it("returns false when the transaction doesn't exist (not yet propagated, or never happened)", async () => {
    const mint = Keypair.generate();
    getConnection.mockReturnValue({ getTransaction: vi.fn().mockResolvedValue(null) });

    const result = await verifyTransactionCreatedMint("sig123", mint.publicKey.toBase58());
    expect(result).toBe(false);
  });

  it("returns false when the transaction failed on-chain", async () => {
    const mint = Keypair.generate();
    const txResponse = buildCreateAccountTransaction(mint);
    txResponse.meta.err = { InstructionError: [0, "Custom"] } as unknown as null;
    getConnection.mockReturnValue({ getTransaction: vi.fn().mockResolvedValue(txResponse) });

    const result = await verifyTransactionCreatedMint("sig123", mint.publicKey.toBase58());
    expect(result).toBe(false);
  });
});
