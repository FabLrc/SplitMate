import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { isAllowedPushEndpoint } from "@/lib/push-endpoint";

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails(
    "mailto:" + (process.env.VAPID_CONTACT_EMAIL ?? "noreply@example.com"),
    publicKey,
    privateKey
  );
  initialized = true;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a push notification to all subscriptions of a given user.
 * Automatically removes expired/invalid subscriptions (410 Gone).
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  ensureInitialized();
  if (!initialized) return { sent: 0, total: 0 };

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  // Defense in depth: rows created before endpoint validation existed (or by
  // any future path) must never reach a non-vendor host.
  const allowed = subs.filter((sub) => isAllowedPushEndpoint(sub.endpoint));
  const rejected = subs.filter((sub) => !isAllowedPushEndpoint(sub.endpoint));
  if (rejected.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: rejected.map((sub) => sub.id) } },
    });
  }

  const results = await Promise.allSettled(
    allowed.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? err.statusCode
            : 0;
        // 404 or 410 means the subscription is no longer valid
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
        throw err;
      }
    })
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { sent, total: allowed.length };
}
