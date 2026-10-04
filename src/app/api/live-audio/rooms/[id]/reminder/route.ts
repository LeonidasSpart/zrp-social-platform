import { NextResponse } from "next/server";
import { createReminder, cancelReminder, hasReminder } from "@/lib/live-reminders/reminder-service";
import { withLiveAudioAuth } from "@/lib/live-audio/route-helpers";

/** Whether the viewer already has a "remind me" subscription, so the web toggle shows its real state after a reload. */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const reminded = await hasReminder(userId, "AUDIO", id);
    return NextResponse.json({ reminded });
  });
}

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
