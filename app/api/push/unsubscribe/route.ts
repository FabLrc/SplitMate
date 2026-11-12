import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logServerError } from "@/lib/log";

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { endpoint } = unsubscribeSchema.parse(body);

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Donnees invalides." }, { status: 400 });
    }
    logServerError("push-unsubscribe", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
