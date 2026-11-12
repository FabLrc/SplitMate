import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { nanoid } from "nanoid";
import { logServerError } from "@/lib/log";

// This route backs the client polling on the session page — it must never be
// served from any cache layer (CDN, Next data cache, or browser HTTP cache).
export const dynamic = "force-dynamic";

async function getSessionAndCheckAccess(
  sessionId: string,
  userId: string
) {
  const expSession = await prisma.expenseSession.findUnique({
    where: { id: sessionId },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      invitee: { select: { id: true, name: true, image: true } },
      expenses: {
        include: { addedBy: { select: { id: true, name: true, image: true } } },
        orderBy: { date: "desc" },
      },
    },
  });

  if (!expSession) return { error: "Session introuvable.", status: 404 };

  const isMember =
    expSession.creatorId === userId || expSession.inviteeId === userId;
  if (!isMember) return { error: "Accès refusé.", status: 403 };

  return { expSession };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const result = await getSessionAndCheckAccess(id, session.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.expSession, {
    headers: { "Cache-Control": "no-store" },
  });
}

class TxError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const expSession = await tx.expenseSession.findUnique({
        where: { id },
      });
      if (!expSession) throw new TxError("Session introuvable.", 404);

      const isCreator = expSession.creatorId === userId;
      const isInvitee = expSession.inviteeId === userId;

      if (!isCreator && !isInvitee) throw new TxError("Accès refusé.", 403);

      if (isCreator) {
        await tx.expenseSession.delete({ where: { id } });
      } else {
        // Rotate the share code: the link the user was given must not let
        // anyone (including the person who just left) back into the history.
        await tx.expenseSession.update({
          where: { id },
          data: { inviteeId: null, shareCode: nanoid(8) },
        });
      }
    });

    revalidatePath("/dashboard");

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof TxError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logServerError("session-delete", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

const updateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  defaultSplitRatio: z.number().min(0).max(1).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  // Reopening is intentionally impossible: it changed the split applied to the
  // invitee's expenses after the fact.
  status: z.literal("CLOSED").optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = updateSessionSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const expSession = await tx.expenseSession.findUnique({
        where: { id },
      });
      if (!expSession) throw new TxError("Session introuvable.", 404);
      if (expSession.creatorId !== userId)
        throw new TxError("Seul le créateur peut modifier la session.", 403);
      if (expSession.status === "CLOSED")
        throw new TxError("La session est fermée.", 400);

      return tx.expenseSession.update({
        where: { id },
        data,
        include: {
          creator: { select: { id: true, name: true, image: true } },
          invitee: { select: { id: true, name: true, image: true } },
        },
      });
    });

    revalidatePath(`/sessions/${id}`);
    revalidatePath("/dashboard");

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof TxError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Données invalides.", issues: error.issues },
        { status: 400 }
      );
    }
    logServerError("session-update", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
