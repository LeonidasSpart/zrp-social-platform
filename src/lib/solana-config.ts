import { PublicKey } from "@solana/web3.js";

const DEFAULT_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ||
    DEFAULT_USDC_MINT
);

const platformWalletAddress =
  process.env.NEXT_PUBLIC_PLATFORM_WALLET ||
  process.env.NEXT_PUBLIC_SOLANA_WALLET_ADDRESS ||
  process.env.SOLANA_WALLET_ADDRESS;

if (!platformWalletAddress) {
  throw new Error(
    "Platform wallet address is not configured."
  );
}

export const PLATFORM_WALLET_PUBLIC_KEY =
  new PublicKey(platformWalletAddress);

export const USDC_DECIMALS = 6;
