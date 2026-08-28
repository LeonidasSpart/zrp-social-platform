import { prisma } from "./db";
import type { Session } from "next-auth";

/**
 * Records an immutable entry for a sensitive administrator action -
 * moderation, role/permission changes, payment or withdrawal
 * decisions, account security events. Never throws: a logging failure
 * must not block or roll back the action it's describing, so errors
 * are swallowed after being logged to the console.
 */
export async function logAdminAction(params: {
  actor: Session | { user: { id: string; username?: string | null } };
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const actorId = params.actor.user?.id;
    if (!actorId) return;

    await prisma.auditLog.create({
      data: {
        actorId,
        actorUsername: (params.actor.user as { username?: string | null } | undefined)?.username ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        metadata: params.metadata as any,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log entry:", params.action, error);
  }
}
