export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Keypair } from "@solana/web3.js";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimalStrings as jsonWithDecimals } from "@/lib/launchpad/json";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { validateTrustedUploadUrls } from "@/lib/media-url";
import { rejectNativePayment } from "@/lib/native-payment-policy.server";
import { checkPaymentSender } from "@/lib/payment-sender";
import { getVerifiedWallet } from "@/lib/launchpad/entitlement";
import { mintLaunchedNft } from "@/lib/launchpad/mint-service";

// Flat USDC fee - cheaper than a fungible token launch (TOKEN_CREATION_FEE_USDC
// in tokens/route.ts) since an NFT mint is a single, much smaller on-chain
// footprint (no supply/decimals choice, no separate reward-pool economics
// to seed later).
const NFT_CREATION_FEE_USDC = 5;
const FEE_TOLERANCE = 0.000001; // USDC has 6 decimals

const MAX_ATTRIBUTES = 20;

const CREATOR_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

interface NftAttribute {
  trait_type: string;
  value: string;
}

function validateAttributes(value: unknown): { ok: true; attributes: NftAttribute[] | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, attributes: null };
  if (!Array.isArray(value)) return { ok: false, error: "Attributes must be an array." };
  if (value.length > MAX_ATTRIBUTES) return { ok: false, error: `At most ${MAX_ATTRIBUTES} attributes are allowed.` };

  const cleaned: NftAttribute[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>).trait_type !== "string" ||
      typeof (entry as Record<string, unknown>).value !== "string"
    ) {
      return { ok: false, error: "Each attribute needs a trait_type and value (both strings)." };
    }
    const traitType = (entry as Record<string, string>).trait_type.trim();
    const traitValue = (entry as Record<string, string>).value.trim();
    if (!traitType || traitType.length > 64 || !traitValue || traitValue.length > 256) {
      return { ok: false, error: "Attribute trait_type/value must be non-empty and within length limits." };
    }
    cleaned.push({ trait_type: traitType, value: traitValue });
  }
  return { ok: true, attributes: cleaned.length > 0 ? cleaned : null };
}

// ─── GET: public browse - only COMPLETED mints, newest first ────────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const collectionName = req.nextUrl.searchParams.get("collectionName");

    const nfts = await prisma.launchedNft.findMany({
      where: {
        status: "COMPLETED",
        mintAddress: { not: null },
        ...(collectionName ? { collectionName } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        mintAddress: true,
        name: true,
        description: true,
        imageUrl: true,
        collectionName: true,
        attributes: true,
        sellerFeeBasisPoints: true,
        revokeUpdate: true,
        createdAt: true,
        creator: { select: CREATOR_SELECT },
      },
    });

    const { items, nextCursor } = buildPage(nfts, limit);
    return jsonWithDecimals({ nfts: items, nextCursor });
  } catch (error) {
    console.error("Error fetching launched NFTs:", error);
    return NextResponse.json({ error: "Failed to fetch NFTs" }, { status: 500 });
  }
}

// ─── POST: create (mint) a new 1-of-1 NFT ────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 10, window: 300, type: "launchpad-nft-create" });
    if (!limit.success) return limit.response;

    const nativeBlock = rejectNativePayment(req);
    if (nativeBlock) return nativeBlock;

    const body = await req.json();
    const { name, symbol, description, imageUrl, collectionName, attributes, sellerFeeBasisPoints, revokeUpdate, transactionId } = body;

    if (!isNonEmptyString(name) || name.trim().length > 32) {
      return NextResponse.json({ error: "Name is required (max 32 characters)." }, { status: 400 });
    }
    if (!isNonEmptyString(symbol) || !/^[A-Za-z0-9]{1,10}$/.test(symbol.trim())) {
      return NextResponse.json({ error: "Symbol is required (max 10 letters/numbers, no spaces)." }, { status: 400 });
    }
    const cleanSymbol = symbol.trim().toUpperCase();

    let cleanDescription: string | null = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== "string" || description.length > 1000) {
        return NextResponse.json({ error: "Description is too long (max 1000 characters)." }, { status: 400 });
      }
      cleanDescription = description.trim() || null;
    }

    if (!isNonEmptyString(imageUrl)) {
      return NextResponse.json({ error: "An image is required." }, { status: 400 });
    }
    const imageCheck = validateTrustedUploadUrls([imageUrl]);
    if (!imageCheck.ok) {
      return NextResponse.json({ error: imageCheck.error }, { status: 400 });
    }

    let cleanCollectionName: string | null = null;
    if (collectionName !== undefined && collectionName !== null) {
      if (typeof collectionName !== "string" || collectionName.length > 64) {
        return NextResponse.json({ error: "Collection name is too long (max 64 characters)." }, { status: 400 });
      }
      cleanCollectionName = collectionName.trim() || null;
    }

    const attributesCheck = validateAttributes(attributes);
    if (!attributesCheck.ok) {
      return NextResponse.json({ error: attributesCheck.error }, { status: 400 });
    }

    const numericRoyalty = sellerFeeBasisPoints === undefined || sellerFeeBasisPoints === null ? 0 : Number(sellerFeeBasisPoints);
    if (!Number.isInteger(numericRoyalty) || numericRoyalty < 0 || numericRoyalty > 10000) {
      return NextResponse.json({ error: "Royalty must be an integer between 0 and 10000 basis points." }, { status: 400 });
    }

    if (!isNonEmptyString(transactionId)) {
      return NextResponse.json({ error: "Transaction ID is required." }, { status: 400 });
    }

    const cleanRevokeUpdate = revokeUpdate === true;

    const walletAddress = await getVerifiedWallet(userId);
    if (!walletAddress) {
      return NextResponse.json(
        { error: "Link and verify a Solana wallet in Settings before creating an NFT." },
        { status: 403 }
      );
    }

    const existingClaim = await prisma.consumedPaymentTransaction.findUnique({ where: { transactionId } });
    if (existingClaim) {
      return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
    }

    let verifiedAmount: number;
    try {
      const { verifyUsdcTransaction } = await import("@/lib/solana");
      const result = await verifyUsdcTransaction(transactionId);
      if (!result || !result.valid) {
        return NextResponse.json({ error: "Invalid or pending transaction." }, { status: 400 });
      }
      verifiedAmount = Number(result.amount);
      if (!Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
        return NextResponse.json({ error: "Could not determine the verified transaction amount." }, { status: 400 });
      }
      if (Math.abs(verifiedAmount - NFT_CREATION_FEE_USDC) > FEE_TOLERANCE) {
        return NextResponse.json(
          { error: `The creation fee is ${NFT_CREATION_FEE_USDC} USDC.`, verifiedAmount, requiredAmount: NFT_CREATION_FEE_USDC },
          { status: 400 }
        );
      }

      const senderError = await checkPaymentSender(userId, result.from);
      if (senderError) {
        return NextResponse.json({ error: senderError }, { status: 400 });
      }
    } catch (err: unknown) {
      console.error("Launchpad NFT fee verification error:", err);
      const message = err instanceof Error ? err.message : "Unknown transaction verification error";
      return NextResponse.json({ error: `Failed to verify transaction: ${message}` }, { status: 400 });
    }

    const launchedNftId = randomUUID();
    let launchedNft;
    try {
      const created = await prisma.$transaction([
        prisma.consumedPaymentTransaction.create({
          data: { transactionId, paymentType: "nft_creation_fee", paymentId: launchedNftId },
        }),
        prisma.launchedNft.create({
          data: {
            id: launchedNftId,
            name: name.trim(),
            description: cleanDescription,
            imageUrl,
            collectionName: cleanCollectionName,
            attributes: attributesCheck.attributes as unknown as object | undefined,
            sellerFeeBasisPoints: numericRoyalty,
            revokeUpdate: cleanRevokeUpdate,
            feeAmount: verifiedAmount,
            feeTransactionId: transactionId,
            status: "PENDING",
            creatorId: userId,
          },
        }),
      ]);
      launchedNft = created[1];
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json({ error: "Transaction already processed." }, { status: 409 });
      }
      throw err;
    }

    const mintKeypair = Keypair.generate();
    const metadataUri = new URL(
      `/api/launchpad/nfts/${mintKeypair.publicKey.toBase58()}/metadata.json`,
      process.env.NEXTAUTH_URL || req.nextUrl.origin
    ).toString();

    await mintLaunchedNft({
      launchedNftId: launchedNft.id,
      ownerWalletAddress: walletAddress,
      mintKeypair,
      name: launchedNft.name,
      symbol: cleanSymbol,
      metadataUri,
      sellerFeeBasisPoints: numericRoyalty,
      revokeUpdate: cleanRevokeUpdate,
    });

    const finalRow = await prisma.launchedNft.findUnique({ where: { id: launchedNft.id } });

    return jsonWithDecimals({ success: finalRow?.status === "COMPLETED", nft: finalRow }, { status: 201 });
  } catch (error) {
    console.error("Launchpad NFT creation error:", error);
    return NextResponse.json({ error: "Failed to create NFT. Please try again." }, { status: 500 });
  }
}
