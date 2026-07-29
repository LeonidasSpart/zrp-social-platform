import { prisma } from "./db";

interface CreateNotificationParams {
  userId: string;
  type: "like" | "comment" | "follow" | "repost";
  fromUserId: string;
  postId?: string;
}

export async function createNotification({
  userId,
  type,
  fromUserId,
  postId,
}: CreateNotificationParams) {
  // Don't notify yourself
  if (userId === fromUserId) return;

  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        fromUserId,
        postId,
      },
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}
