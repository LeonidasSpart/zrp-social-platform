import { NextResponse } from "next/server";
import { createReminder, cancelReminder } from "@/lib/live-reminders/reminder-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    await createReminder(userId, "AUDIO", id);
    return NextResponse.json({ success: true });
  });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    await cancelReminder(userId, "AUDIO", id);
    return NextResponse.json({ success: true });
  });
}
