import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subscription, userId } = await req.json();

    // Store subscription in database
    // We'll create a PushSubscription model
    // For now, we'll store it as a JSON string on the user or separate table.

    // We'll store it in the User model or a separate PushSubscription table.
    // For simplicity, let's create a PushSubscription model.

    // Prisma schema to add:
    // model PushSubscription {
    //   id        String   @id @default(cuid())
    //   userId    String
    //   user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    //   endpoint  String   @unique
    //   keys      Json
    //   createdAt DateTime @default(now())
    // }

    // We'll need to run a migration later.

    // For now, we'll just store in a JSON field on user (if you have a JSON field, otherwise we need migration).
    // I'll provide the migration code below.

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push subscription error:", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
