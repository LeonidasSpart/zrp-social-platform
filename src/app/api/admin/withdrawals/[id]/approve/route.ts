import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { sendUsdc } from "@/lib/solana";

// Finalizes a withdrawal: executes the on-chain USDC transfer, records
// the transaction hash, and marks the request COMPLETED. The funds
// were already reserved (deducted from the creator's balance) when the
// request was created, so no further balance change happens on
// success - only on failure, where the reservation is released back.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  const { id } = await props.params;

  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id },
  });

  if (!withdrawal) {
    return NextResponse.json({ error: "Withdrawal not found." }, { status: 404 });
  }

  if (withdrawal.status !== "PENDING") {
    return NextResponse.json(
      { error: `Withdrawal is already ${withdrawal.status.toLowerCase()}.` },
      { status: 400 }
    );
  }

  // Move it to PROCESSING first so a second concurrent approval click
  // can't also try to send funds - only one request can win this
  // conditional update.
  const claimed = await prisma.withdrawalRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "PROCESSING" },
  });

  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "Withdrawal is already being processed." },
      { status: 409 }
    );
  }

  try {
    const signature = await sendUsdc(withdrawal.walletAddress, withdrawal.amount);

    await prisma.$transaction([
      prisma.withdrawalRequest.update({
        where: { id },
        data: {
          status: "COMPLETED",
          transactionHash: signature,
          processedAt: new Date(),
        },
      }),
      prisma.creatorProfile.update({
        where: { id: withdrawal.creatorProfileId },
        data: { totalWithdrawn: { increment: withdrawal.amount } },
      }),
    ]);

    return NextResponse.json({ success: true, transactionHash: signature });
  } catch (error) {
    console.error("Withdrawal transfer failed:", error);

    // The on-chain transfer didn't go through - release the reserved
    // funds back to the creator's balance and mark the request FAILED
    // so it isn't silently stuck in PROCESSING.
    await prisma.$transaction([
      prisma.withdrawalRequest.update({
        where: { id },
        data: { status: "FAILED" },
      }),
      prisma.creatorProfile.update({
        where: { id: withdrawal.creatorProfileId },
        data: { balance: { increment: withdrawal.amount } },
      }),
    ]);

    return NextResponse.json(
      { error: "Transfer failed. The withdrawal amount has been returned to the creator's balance." },
      { status: 500 }
    );
  }
}
