import { NextRequest, NextResponse } from "next/server";
import { sendGift } from "@/lib/live-gifts/gift-service";
import { withLiveAudioAuth, checkRateLimit } from "@/lib/live-audio/route-helpers";
import { LiveGiftErrors } from "@/lib/live-gifts/errors";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return withLiveAudioAuth(async (userId) => {
    const limitResponse = await checkRateLimit(req, { limit: 20, window: 60, type: "live-gift-send" });
    if (limitResponse) return limitResponse;

    const body = await req.json().catch(() => null);
    if (!body || typeof body.giftKey !== "string") throw LiveGiftErrors.validation("giftKey is required.");
    if (typeof body.idempotencyKey !== "string") throw LiveGiftErrors.validation("idempotencyKey is required.");
    const quantity = Number(body.quantity ?? 1);

    const result = await sendGift({
      senderId: userId,
      roomType: "AUDIO",
      roomId: id,
      giftKey: body.giftKey,
      quantity,
      idempotencyKey: body.idempotencyKey,
    });

    return NextResponse.json({ success: true, gift: result });
  });
}
