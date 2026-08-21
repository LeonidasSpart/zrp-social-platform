import webpush from "web-push";
import crypto from "crypto";
import { prisma } from "./db";
// Initialize Web Push lazily.
// Do not initialize VAPID at module/build time.
function getWebPush() {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error(
      "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not configured"
    );
  }

  // Safe diagnostics. Never log the actual VAPID keys.
  //
  // The byte lengths alone (65 for the public key, 32 for the private
  // key) are exactly right for a real P-256 pair, which was masking
  // the actual problem - FCM was still rejecting every single push
  // with "VAPID public key must be on the P-256 curve" regardless.
  // Right byte count doesn't mean valid key material: a base64 vs
  // base64url encoding mismatch (the VAPID/Push API spec requires
  // base64url - no +, /, or = padding) can silently produce a
  // wrong-but-same-length byte sequence, or the two keys might simply
  // not be a matched pair. This now actually validates the public key
  // decodes to a real point on the P-256 curve (the same check FCM
  // itself does) rather than waiting to find out via repeated
  // delivery failures across every user's push subscriptions.
  const publicKeyBuffer = Buffer.from(vapidPublicKey, "base64url");
  const privateKeyBuffer = Buffer.from(vapidPrivateKey, "base64url");

  const hasNonUrlSafeChars = (value: string) =>
    /[+/=]/.test(value);

  let isValidCurvePoint = true;
  let curveValidationError: string | null = null;
  if (publicKeyBuffer.length !== 65 || publicKeyBuffer[0] !== 0x04) {
    isValidCurvePoint = false;
    curveValidationError = `Expected a 65-byte uncompressed P-256 point starting with 0x04, got ${publicKeyBuffer.length} byte(s) starting with 0x${publicKeyBuffer[0]?.toString(16) ?? "??"}`;
  } else {
    try {
      // Importing as a JWK EC key makes Node/OpenSSL actually validate
      // that (x, y) is a real point on the P-256 curve - the same
      // check FCM performs. ECDH.setPublicKey() used to be the
      // simpler way to do this, but it was dropped from @types/node
      // (Node deprecated it years ago), so this uses the currently
      // supported, properly-typed path instead.
      crypto.createPublicKey({
        key: {
          kty: "EC",
          crv: "P-256",
          x: publicKeyBuffer.subarray(1, 33).toString("base64url"),
          y: publicKeyBuffer.subarray(33, 65).toString("base64url"),
        },
        format: "jwk",
      });
    } catch (err) {
      isValidCurvePoint = false;
      curveValidationError = err instanceof Error ? err.message : String(err);
    }
  }

  console.log("VAPID diagnostics:", {
    publicLength: vapidPublicKey.length,
    privateLength: vapidPrivateKey.length,
    publicDecodedBytes: publicKeyBuffer.length,
    privateDecodedBytes: privateKeyBuffer.length,
    publicLooksBase64NotBase64url: hasNonUrlSafeChars(vapidPublicKey),
    privateLooksBase64NotBase64url: hasNonUrlSafeChars(vapidPrivateKey),
    publicKeyIsValidP256Point: isValidCurvePoint,
    curveValidationError,
  });

  if (!isValidCurvePoint) {
    throw new Error(
      `VAPID_PUBLIC_KEY does not decode to a valid point on the P-256 curve (${curveValidationError}). ` +
        "Regenerate a fresh pair with `npx web-push generate-vapid-keys` and make sure both " +
        "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on Railway are updated together from that same run - " +
        "an old key paired with a new one, or a key copied from base64 instead of base64url, will pass " +
        "the length check but still fail here."
    );
  }

  webpush.setVapidDetails(
    "mailto:support@zrp.one",
    vapidPublicKey,
    vapidPrivateKey
  );
  return webpush;
}
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url: string = "/"
) {
  try {
    const push = getWebPush();
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });
    if (subscriptions.length === 0) {
      return;
    }
    const payload = JSON.stringify({
      title,
      body,
      url,
    });
    for (const sub of subscriptions) {
      try {
        await push.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys as any,
          },
          payload
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          try {
            await prisma.pushSubscription.delete({
              where: {
                endpoint: sub.endpoint,
              },
            });
          } catch (deleteError) {
            console.error(
              "Failed to delete expired push subscription:",
              deleteError
            );
          }
        } else {
          console.error(
            "Push notification delivery error:",
            err
          );
        }
      }
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}
