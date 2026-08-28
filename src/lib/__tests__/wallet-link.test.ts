import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildWalletLinkMessage, verifyWalletSignature } from "../wallet-link";

function makeSignedMessage(userId: string, nonce: string) {
  const keypair = nacl.sign.keyPair();
  const walletAddress = bs58.encode(keypair.publicKey);
  const message = buildWalletLinkMessage(userId, nonce);
  const signature = nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey);
  return { walletAddress, message, signature: bs58.encode(signature), keypair };
}

describe("verifyWalletSignature", () => {
  it("accepts a genuine signature from the claimed wallet's own key", () => {
    const { walletAddress, message, signature } = makeSignedMessage("user-1", "nonce-abc");
    expect(verifyWalletSignature(walletAddress, message, signature)).toBe(true);
  });

  it("rejects a signature produced by a different wallet than claimed", () => {
    const signed = makeSignedMessage("user-1", "nonce-abc");
    const otherWallet = bs58.encode(nacl.sign.keyPair().publicKey);
    expect(verifyWalletSignature(otherWallet, signed.message, signed.signature)).toBe(false);
  });

  it("rejects a signature over a different (tampered) message", () => {
    const signed = makeSignedMessage("user-1", "nonce-abc");
    const tamperedMessage = buildWalletLinkMessage("user-2", "nonce-abc"); // different account
    expect(verifyWalletSignature(signed.walletAddress, tamperedMessage, signed.signature)).toBe(false);
  });

  it("rejects garbage input instead of throwing", () => {
    expect(verifyWalletSignature("not-base58!!!", "message", "not-base58!!!")).toBe(false);
    expect(verifyWalletSignature("", "", "")).toBe(false);
  });

  it("rejects a public key that isn't 32 bytes", () => {
    const shortKey = bs58.encode(Buffer.from([1, 2, 3]));
    const signed = makeSignedMessage("user-1", "nonce-abc");
    expect(verifyWalletSignature(shortKey, signed.message, signed.signature)).toBe(false);
  });

  it("builds a message that binds both the userId and nonce (replay protection)", () => {
    const messageA = buildWalletLinkMessage("user-1", "nonce-1");
    const messageB = buildWalletLinkMessage("user-1", "nonce-2");
    const messageC = buildWalletLinkMessage("user-2", "nonce-1");
    expect(messageA).not.toBe(messageB);
    expect(messageA).not.toBe(messageC);
  });
});
