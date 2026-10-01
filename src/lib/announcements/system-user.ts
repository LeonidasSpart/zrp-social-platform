import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Notification.fromUserId is a required, cascading FK to User (see
 * prisma/schema.prisma) - every notification needs a real "actor". For
 * a broadcast that's about to produce one Notification row per
 * eligible member, that actor must NOT be the admin who clicked Send:
 * if that admin's account were ever deleted later, onDelete: Cascade
 * on Notification_fromUser would cascade-delete every recipient's copy
 * of every announcement that admin ever sent - a single account
 * deletion silently wiping broadcast history for everyone else, and at
 * announcement scale (hundreds of thousands of rows) exactly the kind
 * of accidental mass-delete this feature has to avoid causing.
 *
 * Instead, every announcement notification is attributed to one fixed,
 * reserved system account ("ZRP"), created lazily and idempotently the
 * first time it's needed. This is a plain User row - no schema change,
 * no second actor concept, and it shows up in the notification center
 * exactly like any other notification's `fromUser`, which is also the
 * correct UX (an announcement is "from ZRP", not from whichever admin
 * happened to click Send).
 */
const SYSTEM_EMAIL = "system-announcements@zrp.internal";
const SYSTEM_USERNAME = "zrp_announcements";

let cachedSystemUserId: string | null = null;

export async function getAnnouncementSystemUserId(): Promise<string> {
  if (cachedSystemUserId) return cachedSystemUserId;

  const existing = await prisma.user.findUnique({
    where: { email: SYSTEM_EMAIL },
    select: { id: true },
  });
  if (existing) {
    cachedSystemUserId = existing.id;
    return existing.id;
  }

  try {
    const created = await prisma.user.create({
      data: {
        email: SYSTEM_EMAIL,
        username: SYSTEM_USERNAME,
        // Unusable random credential - this account never logs in, it
        // exists only to be the `fromUser` of broadcast notifications.
        password: crypto.randomBytes(32).toString("hex"),
        name: "ZRP",
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    cachedSystemUserId = created.id;
    return created.id;
  } catch (err) {
    // Two concurrent first-ever sends can both race past the findUnique
    // above and both attempt the create - same non-atomic-upsert race
    // documented for ensurePlayProfile() (src/lib/play/xp.ts) and
    // reserveAiMessage() (src/lib/ai-quota.ts). The loser's row now
    // genuinely exists; just re-read it instead of failing the send.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const row = await prisma.user.findUniqueOrThrow({
        where: { email: SYSTEM_EMAIL },
        select: { id: true },
      });
      cachedSystemUserId = row.id;
      return row.id;
    }
    throw err;
  }
}
