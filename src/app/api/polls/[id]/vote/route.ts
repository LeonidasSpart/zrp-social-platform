import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pollId = params.id;
  const userId = session.user.id;

  try {
    const { optionIndex } = await req.json();

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
    });

    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    // ─── Validate optionIndex is a real, in-range option ───────────────
    if (
      typeof optionIndex !== "number" ||
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= poll.options.length
    ) {
      return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    }

    // Check if poll expired
    if (poll.expiresAt && new Date(poll.expiresAt) < new Date()) {
      return NextResponse.json({ error: "Poll has ended" }, { status: 400 });
    }

    // Check if user already voted
    const existingVote = await prisma.pollVote.findUnique({
      where: {
        pollId_userId: {
          pollId,
          userId,
        },
      },
    });

    if (existingVote) {
      return NextResponse.json({ error: "Already voted" }, { status: 400 });
    }

    // Create vote
    await prisma.pollVote.create({
      data: {
        pollId,
        userId,
        optionIndex,
      },
    });

    // Update votes count in poll
    const votes = poll.votes as Record<string, number> || {};
    votes[optionIndex] = (votes[optionIndex] || 0) + 1;

    await prisma.poll.update({
      where: { id: pollId },
      data: { votes },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Poll vote error:", error);
    return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
  }
}
