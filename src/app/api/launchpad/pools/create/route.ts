export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings } from "@/lib/launchpad/json";
import { getConnection } from "@/lib/solana";
import { verifyPoolCreationTransaction, PoolVerificationError } from "@/lib/launchpad/raydium-pool-service";

/*
 * Records (never signs or broadcasts) a Raydium CPMM pool creation that
 * already happened in the browser, wallet-signed
 * (src/lib/launchpad/client-liquidity.ts). Exactly the same trust shape
 * as POST /api/launchpad/tokens: the client reports a transaction
 * signature, this route independently re-derives the real pool/vault/LP
 * addresses and re-reads the real transaction before writing anything.
 */

function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 300, type: "launchpad-pool-create" });
    if (!limit.success) return limit.response;

    const body = await req.json();
    const { tokenMintAddress, tokenProgramId, quoteMintAddress, creatorWalletAddress, transactionId } = body;

    for (const [value, label] of [
      [tokenMintAddress, "tokenMintAddress"],
      [tokenProgramId, "tokenProgramId"],
      [quoteMintAddress, "quoteMintAddress"],
      [creatorWalletAddress, "creatorWalletAddress"],
    ] as const) {
      if (typeof value !== "string" || !isValidPublicKey(value)) {
        return NextResponse.json({ error: `A valid ${label} is required.` }, { status: 400 });
      }
    }
    if (![TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()].includes(tokenProgramId)) {
      return NextResponse.json({ error: "Unsupported token program." }, { status: 400 });
    }
    if (typeof transactionId !== "string" || !transactionId.trim()) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }
    const cleanTxId = transactionId.trim();

    const existing = await prisma.tokenPool.findUnique({ where: { createTransactionId: cleanTxId } });
    if (existing) {
      return jsonWithDecimalStrings({ pool: existing }, { status: 200 });
    }

    let verified;
    try {
      verified = await verifyPoolCreationTransaction(getConnection(), cleanTxId, {
        tokenMintAddress,
        tokenProgramId,
        quoteMintAddress,
        creatorWalletAddress,
      });
    } catch (err: unknown) {
      if (err instanceof PoolVerificationError) {
        const status = err.status === "NOT_FOUND_YET" ? 202 : 400;
        return NextResponse.json({ error: err.message, status: err.status }, { status });
      }
      console.error("Pool creation verification error:", err);
      return NextResponse.json({ error: "Failed to verify the pool creation transaction." }, { status: 502 });
    }

    const existingPoolAddress = await prisma.tokenPool.findUnique({ where: { poolAddress: verified.poolId } });
    if (existingPoolAddress) {
      return jsonWithDecimalStrings({ pool: existingPoolAddress }, { status: 200 });
    }

    const launchedToken = await prisma.launchedToken.findUnique({ where: { mintAddress: tokenMintAddress } });

    let pool;
    try {
      pool = await prisma.tokenPool.create({
        data: {
          launchedTokenId: launchedToken?.id ?? null,
          dex: "RAYDIUM_CPMM",
          poolAddress: verified.poolId,
          baseMint: tokenMintAddress,
          quoteMint: quoteMintAddress,
          lpMint: verified.lpMint,
          baseVault:
            verified.mintA === tokenMintAddress ? verified.vaultA : verified.vaultB,
          quoteVault:
            verified.mintA === tokenMintAddress ? verified.vaultB : verified.vaultA,
          creatorId: userId,
          creatorWalletAddress,
          createTransactionId: cleanTxId,
          status: "ACTIVE",
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        const retry = await prisma.tokenPool.findUnique({ where: { createTransactionId: cleanTxId } });
        if (retry) return jsonWithDecimalStrings({ pool: retry }, { status: 200 });
      }
      throw err;
    }

    return jsonWithDecimalStrings({ pool }, { status: 201 });
  } catch (error) {
    console.error("Pool creation recording error:", error);
    return NextResponse.json({ error: "Failed to record the created pool. Please try again." }, { status: 500 });
  }
}
