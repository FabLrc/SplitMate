import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { clientIp, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ code: string }> };

// POST — join a household by its share code (idempotent).
export async function POST(_req: NextRequest, { params }: Params) {
  const { code } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const limit = rateLimit(
    `household-join:${clientIp(_req.headers)}`,
    20,
    60 * 1000
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const household = await prisma.household.findUnique({
    where: { shareCode: code },
  });
  if (!household)
    return NextResponse.json({ error: "Foyer introuvable." }, { status: 404 });

  await prisma.householdMember.upsert({
    where: {
      householdId_userId: {
        householdId: household.id,
        userId: session.user.id,
      },
    },
    create: {
      householdId: household.id,
      userId: session.user.id,
      role: "MEMBER",
    },
    update: {},
  });

  revalidatePath("/households");
  revalidatePath("/dashboard");

  return NextResponse.json({ householdId: household.id }, { status: 200 });
}
