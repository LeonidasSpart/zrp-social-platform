import {
  Connection,
  PublicKey,
} from "@solana/web3.js";

const DEFAULT_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const DEFAULT_RPC_URL =
  "https://api.devnet.solana.com";

export function getClientUsdcMint(): PublicKey {
  const address =
    process.env.NEXT_PUBLIC_USDC_MINT ||
    DEFAULT_USDC_MINT;

  try {
    return new PublicKey(address);
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_USDC_MINT configuration."
    );
  }
}

export function getClientPlatformWallet(): PublicKey {
  const address =
    process.env.NEXT_PUBLIC_PLATFORM_WALLET;

  if (!address) {
    throw new Error(
      "NEXT_PUBLIC_PLATFORM_WALLET is not configured."
    );
  }

  try {
    return new PublicKey(address);
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_PLATFORM_WALLET address."
    );
  }
}

let connection: Connection | null = null;

export function getConnection(): Connection {
  if (connection) {
    return connection;
  }

  const configuredRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

  if (!configuredRpcUrl) {
    // Same fail-closed posture as getConnection() in src/lib/solana.ts: a
    // misconfigured production deploy (NEXT_PUBLIC_SOLANA_RPC_URL unset)
    // must not silently build/sign client-side transactions against the
    // public Devnet endpoint - every Launchpad create/buy/sell transaction
    // built client-side goes through this connection.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXT_PUBLIC_SOLANA_RPC_URL must be configured in production. Refusing to fall back to the public Devnet endpoint."
      );
    }
  }

  const rpcUrl = configuredRpcUrl || DEFAULT_RPC_URL;

  if (
    !rpcUrl.startsWith("http://") &&
    !rpcUrl.startsWith("https://")
  ) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SOLANA_RPC_URL."
    );
  }

  connection = new Connection(
    rpcUrl,
    "confirmed"
  );

  return connection;
}
