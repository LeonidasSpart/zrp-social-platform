export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings as jsonWithDecimals } from "@/lib/launchpad/json";
import { validateTrustedUploadUrls } from "@/lib/media-url";
import { normalizeProfileWebsite } from "@/lib/profile-website";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";
import { verifyZrpCreateTransaction, ZrpVerificationError, getZrpGlobalConfig } from "@/lib/launchpad/zrp-launch-service";
import { scanTokenOnChain } from "@/lib/launchpad/mint-verification";
import { getConnection } from "@/lib/solana";
import { PublicKey } from "@solana/web3.js";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidPublicKey(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/*
 * POST: verify + record an already-created ZRP-native bonding-curve
 * token. The mint itself happens entirely in the browser
 * (src/lib/launchpad/client-zrp-launch.ts), against ZRP's own Launchpad
 * program (programs/zrp-launchpad/) - never Pump.fun's. ZRP never signs
 * or custodies anything here. This route independently re-derives the
 * token's real on-chain name/symbol/creator/supply from the transaction's
 * own decoded TokenCreatedEvent (never trusting the client's submitted
 * name/symbol beyond initial cosmetic validation) and re-scans the
 * resulting mint account for its real decimals/supply, before recording
 * anything - "never record a token as created before chain verification."
 *
 * ZRP charges its own creation fee on-chain, in the same create_and_buy
 * transaction (verified here via the TokenCreatedEvent's own reserves,
 * not a separate payment-verification step), so there is no
 * feeTransactionId for these rows - only feeAmount, in SOL. This replaces
 * the old pump.fun-backed creation path (venue PUMP_CURVE), which has
 * been removed from ZRP's own creation UI entirely - see
 * docs/zrp-launchpad-deployment.md.
 */
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 5, window: 300, type: "launchpad-zrp-create" });
    if (!limit.success) return limit.response;

    const nativeBlock = rejectNativePayment(req);
    if (nativeBlock) return nativeBlock;

    const body = await req.json();
    const { name, symbol, description, imageUrl, website, twitter, telegram, discord, mintAddress, walletAddress, transactionId } = body;

    // ─── Off-chain display field validation (cosmetic only for
    // description/image/socials - name/symbol are re-derived from the
    // real on-chain TokenCreatedEvent below and never trusted from the
    // client for the stored record) ──────────────────────────────────
    if (!isNonEmptyString(name) || name.trim().length > 32) {
      return NextResponse.json({ error: "Name is required (max 32 characters)." }, { status: 400 });
    }
    if (!isNonEmptyString(symbol) || !/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) {
      return NextResponse.json({ error: "Symbol is required (max 10 letters/numbers, no spaces)." }, { status: 400 });
    }

    let cleanDescription: string | null = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== "string" || description.length > 1000) {
        return NextResponse.json({ error: "Description is too long (max 1000 characters)." }, { status: 400 });
      }
      cleanDescription = description.trim() || null;
    }

    if (!isNonEmptyString(imageUrl)) {
      return NextResponse.json({ error: "A token image is required." }, { status: 400 });
    }
    const imageCheck = validateTrustedUploadUrls([imageUrl]);
    if (!imageCheck.ok) {
      return NextResponse.json({ error: imageCheck.error }, { status: 400 });
    }

    const socialLinks: { website: string | null; twitter: string | null; telegram: string | null; discord: string | null } = {
      website: null,
      twitter: null,
      telegram: null,
      discord: null,
    };
    for (const [key, value, label] of [
      ["website", website, "Website"],
      ["twitter", twitter, "Twitter"],
      ["telegram", telegram, "Telegram"],
      ["discord", discord, "Discord"],
    ] as const) {
      const result = normalizeProfileWebsite(value, label);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      socialLinks[key] = result.value;
    }

    if (!isNonEmptyString(mintAddress) || !isValidPublicKey(mintAddress.trim())) {
      return NextResponse.json({ error: "A valid mint address is required." }, { status: 400 });
    }
    const cleanMintAddress = mintAddress.trim();

    if (!isNonEmptyString(walletAddress) || !isValidPublicKey(walletAddress.trim())) {
      return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
    }
    const cleanWalletAddress = walletAddress.trim();

    if (!isNonEmptyString(transactionId)) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    // ─── Fast-path duplicate checks (the real race-proof guards are the
    // unique constraints hit inside the create below) ─────────────────
    const existingToken = await prisma.launchedToken.findUnique({ where: { mintAddress: cleanMintAddress } });
    if (existingToken) {
      return NextResponse.json({ error: "This mint has already been recorded." }, { status: 409 });
    }
    const existingTx = await prisma.launchedToken.findUnique({ where: { mintTransactionId: transactionId } });
    if (existingTx) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    // ─── Independently verify the real on-chain creation - never trust
    // the client's claimed name/symbol/creator/program ────────────────
    let verifiedCreate;
    try {
      verifiedCreate = await verifyZrpCreateTransaction(getConnection(), transactionId, {
        mintAddress: cleanMintAddress,
        walletAddress: cleanWalletAddress,
      });
    } catch (err: unknown) {
      if (err instanceof ZrpVerificationError) {
        const status = err.status === "NOT_FOUND_YET" ? 202 : 400;
        return NextResponse.json({ error: err.message, status: err.status }, { status });
      }
      console.error("ZRP create verification error:", err);
      return NextResponse.json({ error: "Could not verify the creation transaction. Try again in a moment." }, { status: 502 });
    }

    // ─── Re-scan the real mint account for decimals/supply - ZRP's
    // program fixes these on-chain (mint/freeze authority revoked
    // immediately after minting); never guessed or taken from the client
    // ────────────────────────────────────────────────────────────────
    let onChain;
    try {
      onChain = await scanTokenOnChain(cleanMintAddress);
    } catch (err: unknown) {
      console.error("ZRP create mint scan error:", err);
      return NextResponse.json({ error: "Could not read the mint from the chain. Try again in a moment." }, { status: 502 });
    }

    // The real on-chain creation fee, read from GlobalConfig (not the
    // client) and formatted in SOL to match the Decimal(18,6) column -
    // every ZRP_LAUNCH row charges the same fee at a given time, so this
    // is a fact about the protocol's current config, not a client claim.
    let feeAmountSol: string | null = null;
    try {
      const config = await getZrpGlobalConfig(getConnection());
      feeAmountSol = (Number(config.creationFeeLamports) / 1_000_000_000).toFixed(6);
    } catch (err) {
      console.error("ZRP create: could not read GlobalConfig for fee recording:", err);
    }

    let launchedToken;
    try {
      launchedToken = await prisma.launchedToken.create({
        data: {
          venue: "ZRP_LAUNCH",
          mintAddress: cleanMintAddress,
          bondingCurveAddress: verifiedCreate.bondingCurveAddress,
          name: verifiedCreate.name || name.trim(),
          symbol: (verifiedCreate.symbol || symbol.trim()).toUpperCase(),
          description: cleanDescription,
          imageUrl,
          website: socialLinks.website,
          twitter: socialLinks.twitter,
          telegram: socialLinks.telegram,
          discord: socialLinks.discord,
          supply: onChain.supplyRaw,
          decimals: onChain.decimals,
          // ZRP's program revokes both authorities immediately after
          // minting and metadata creation (see create_and_buy in
          // programs/zrp-launchpad/src/lib.rs) - always true for this
          // venue, never a claim taken from the client.
          revokeMint: true,
          revokeFreeze: true,
          revokeUpdate: true,
          feeAmount: feeAmountSol,
          feeTransactionId: null,
          mintTransactionId: transactionId,
          status: "COMPLETED",
          creatorId: userId,
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction or mint already processed." }, { status: 409 });
      }
      throw err;
    }

    return jsonWithDecimals({ success: true, token: launchedToken }, { status: 201 });
  } catch (error) {
    console.error("ZRP token creation error:", error);
    return NextResponse.json({ error: "Failed to record the created token. Please try again." }, { status: 500 });
  }
}
