import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isBlockedEitherWay } from "@/lib/auth-guards";
import { findVisiblePost } from "@/lib/post-visibility";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    // Same visibility/block rules as interacting with the post itself.
    const pollPost = await prisma.post.findUnique({
      where: { pollId },
      select: { id: true, authorId: true },
    });
    if (pollPost) {
      if (!(await findVisiblePost(userId, pollPost.id))) {
        return NextResponse.json({ error: "Poll not found" }, { status: 404 });
      }
      if (pollPost.authorId !== userId && (await isBlockedEitherWay(userId, pollPost.authorId))) {
        return NextResponse.json({ error: "Unable to vote on this poll" }, { status: 403 });
      }
    }

    // ⚠️ CORRECTNESS: the vote row and the aggregate `votes` JSON used to
    // be written as check -> create -> read-modify-write of the JSON
    // copy loaded at the START of the request. Two different users
    // voting at the same time both wrote back their own stale copy +1,
    // so one vote was silently lost from the displayed totals forever;
    // and a double-tap raced past the "already voted" check into an
    // unhandled unique-constraint 500. Now the vote row (whose
    // [pollId, userId] unique constraint is the real one-vote guard)
    // and an in-database increment of that option's counter commit
    // together - the UPDATE takes the row lock, so concurrent voters
    // serialise instead of overwriting each other.
    const key = String(optionIndex);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.pollVote.create({
          data: {
            pollId,
            userId,
            optionIndex,
          },
        });
        await tx.$executeRaw`
          UPDATE "Poll"
          SET "votes" = jsonb_set(
                CASE WHEN jsonb_typeof("votes") = 'object' THEN "votes" ELSE '{}'::jsonb END,
                ARRAY[${key}]::text[],
                to_jsonb(COALESCE(("votes"->>${key})::int, 0) + 1)
              ),
              "updatedAt" = NOW()
          WHERE "id" = ${pollId}`;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ error: "Already voted" }, { status: 400 });
      }
      throw err;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Poll vote error:", error);
    return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
  }
}
