"use client";

/*
 * Shared "connect + sign a message" helper for the launchpad's claim-
 * style flows (vesting now; staking/farming rewards claims later reuse
 * this same shape). Talks directly to the standard injected provider
 * Phantom/Solflare/Backpack expose - the exact pattern already proven
 * in WalletVerifyPanel.tsx for wallet linking. No wallet-adapter
 * dependency (see TipModal.tsx's own comment on why that was removed).
 * Signing a message never authorizes a transaction.
 */

export interface InjectedSolanaProvider {
  connect: () => Promise<{ publicKey?: { toString(): string } } | void>;
  publicKey?: { toString(): string } | null;
  signMessage: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
}

export function findInjectedSolanaProvider(): InjectedSolanaProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: InjectedSolanaProvider };
    solflare?: InjectedSolanaProvider;
    backpack?: InjectedSolanaProvider;
    solana?: InjectedSolanaProvider;
  };
  const candidates = [w.phantom?.solana, w.solflare, w.backpack, w.solana];
  return candidates.find((p) => p && typeof p.signMessage === "function" && typeof p.connect === "function") ?? null;
}

export async function connectAndSignMessage(message: string): Promise<{ walletAddress: string; signature: string }> {
  const provider = findInjectedSolanaProvider();
  if (!provider) {
    throw new Error("No Solana wallet extension found. Install Phantom, Solflare or Backpack.");
  }

  const connected = await provider.connect();
  const publicKey = (connected && connected.publicKey) || provider.publicKey;
  const walletAddress = publicKey?.toString();
  if (!walletAddress) {
    throw new Error("Could not read the connected wallet's address.");
  }

  const signed = await provider.signMessage(new TextEncoder().encode(message), "utf8");
  const signatureBytes = signed instanceof Uint8Array ? signed : signed?.signature;
  if (!(signatureBytes instanceof Uint8Array)) {
    throw new Error("The wallet did not return a signature.");
  }

  const { default: bs58 } = await import("bs58");
  return { walletAddress, signature: bs58.encode(signatureBytes) };
}
