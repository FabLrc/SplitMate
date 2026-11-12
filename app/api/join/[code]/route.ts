import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { clientIp, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ code: string }> };

// POST — join a session by its share code (the invite secret).
// The session id alone is never sufficient: ids leak through URLs, push
// payloads and household listings.
export async function POST(_req: NextRequest, { params }: Params) {
  const { code } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const limit = rateLimit(`join:${clientIp(_req.headers)}`, 20, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const expSession = await prisma.expenseSession.findUnique({
    where: { shareCode: code },
  });

  if (!expSession) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 404 });
  }

  if (expSession.creatorId === session.user.id) {
    return NextResponse.json({ redirect: `/sessions/${expSession.id}` });
  }

  if (expSession.inviteeId && expSession.inviteeId !== session.user.id) {
    return NextResponse.json(
      { error: "Cette session a déjà un invité." },
      { status: 400 }
    );
  }

  if (!expSession.inviteeId) {
    // Atomic: only succeeds while the invitee slot is still empty.
    const { count } = await prisma.expenseSession.updateMany({
      where: { id: expSession.id, inviteeId: null },
      data: { inviteeId: session.user.id },
    });
    if (count === 0) {
      return NextResponse.json(
        { error: "Cette session a déjà un invité." },
        { status: 400 }
      );
    }
  }

  revalidatePath(`/sessions/${expSession.id}`);
  revalidatePath("/dashboard");

  return NextResponse.json({ redirect: `/sessions/${expSession.id}` });
}
