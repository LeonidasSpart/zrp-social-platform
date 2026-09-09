import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteUserAccountAndFiles } from "@/lib/account-deletion";

export const dynamic = "force-dynamic";

// User.deletionScheduledFor (set by POST /api/user/delete) is a promise,
// not an action - nothing was actually enforcing it before this route
// existed. An account past its 30-day grace period stayed fully live and
// undeleted indefinitely unless the user came back and used the separate
// "delete now" path (POST /api/user/delete/confirm) themselves. Same
// CRON_SECRET auth as publish-scheduled-posts and play-daily-rotation -
// deliberately fails CLOSED if the env var is unset.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    const due = await prisma.user.findMany({
      where: { deletionScheduledFor: { lte: now } },
      select: { id: true, username: true },
    });

    if (due.length === 0) {
      return NextResponse.json({ message: "No accounts due for deletion" });
    }

    let deleted = 0;
    for (const user of due) {
      try {
        await deleteUserAccountAndFiles(user.id);
        deleted++;
      } catch (error) {
        // One account's cleanup failing (e.g. a transient UploadThing
        // error) must not block the rest of the sweep - it stays
        // scheduled and this cron run simply retries it next time.
        console.error(`Failed to delete scheduled account ${user.id}:`, error);
      }
    }

    return NextResponse.json({ message: `Deleted ${deleted} of ${due.length} scheduled accounts.` });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Failed to process scheduled deletions" }, { status: 500 });
  }
}
