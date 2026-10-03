import { NextResponse } from "next/server";
import { createReminder, cancelReminder } from "@/lib/live-reminders/reminder-service";
import { withLiveAudioAuth as withLiveVideoAuth } from "@/lib/live-video/route-helpers";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    await createReminder(userId, "VIDEO", id);
    return NextResponse.json({ success: true });
  });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveVideoAuth(async (userId) => {
    await cancelReminder(userId, "VIDEO", id);
    return NextResponse.json({ success: true });
  });
}
