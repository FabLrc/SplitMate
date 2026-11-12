import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { isAllowedPushEndpoint } from "@/lib/push-endpoint";
import { rateLimit } from "@/lib/rate-limit";
import { logServerError } from "@/lib/log";

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 });
  }

  const limit = rateLimit(`push:${userId}`, 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const data = subscriptionSchema.parse(body);

    // The endpoint is a server-side POST target: only vendor push services.
    if (!isAllowedPushEndpoint(data.endpoint)) {
      return NextResponse.json(
        { error: "Abonnement push invalide." },
        { status: 400 }
      );
    }

    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: data.endpoint },
      select: { userId: true },
    });
    // Never move an endpoint between users: that would let anyone who learns
    // an endpoint hijack another user's notifications.
    if (existing && existing.userId !== userId) {
      return NextResponse.json(
        { error: "Abonnement push invalide." },
        { status: 409 }
      );
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: {
        userId,
        endpoint: data.endpoint,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
      },
      update: {
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Donnees invalides." }, { status: 400 });
    }
    logServerError("push-subscribe", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
