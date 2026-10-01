import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { parseRecipientWallets } from "../client-airdrop";

/*
 * zrppad's own wallet-list parser only checked `line.length === 44` - a
 * weak heuristic that accepts plenty of invalid 44-character strings and
 * silently passes garbage through to a transaction builder. This parses
 * each line as a real PublicKey instead.
 */
describe("parseRecipientWallets", () => {
  it("parses one valid address per line", () => {
    const a = Keypair.generate().publicKey.toBase58();
    const b = Keypair.generate().publicKey.toBase58();
    expect(parseRecipientWallets(`${a}\n${b}`)).toEqual([a, b]);
  });

  it("ignores blank lines and surrounding whitespace", () => {
    const a = Keypair.generate().publicKey.toBase58();
    expect(parseRecipientWallets(`\n  ${a}  \n\n`)).toEqual([a]);
  });

  it("drops a line that isn't a genuinely valid base58 public key, even if it happens to be 44 characters", () => {
    const fortyFourChars = "x".repeat(44);
    expect(parseRecipientWallets(fortyFourChars)).toEqual([]);
  });

  it("deduplicates repeated addresses", () => {
    const a = Keypair.generate().publicKey.toBase58();
    expect(parseRecipientWallets(`${a}\n${a}`)).toEqual([a]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseRecipientWallets("")).toEqual([]);
  });
});
