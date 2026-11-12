import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logServerError } from "@/lib/log";

const MAX_AMOUNT = 10_000_000;

const updateExpenseSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  amount: z.number().positive().max(MAX_AMOUNT).optional(),
  splitRatio: z.number().min(0).max(1).nullable().optional(),
  date: z.string().datetime().optional(),
  toDiscuss: z.boolean().optional(),
  isShared: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string; expenseId: string }> };

class TxError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id, expenseId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = updateExpenseSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({
        where: { id: expenseId },
        include: { session: true },
      });

      if (!expense || expense.sessionId !== id)
        throw new TxError("Dépense introuvable.", 404);

      // Former invitees keep ownership of their expenses in the database, but
      // must not be able to edit them once they left the session.
      const isMember =
        expense.session.creatorId === userId ||
        expense.session.inviteeId === userId;
      if (!isMember) throw new TxError("Accès refusé.", 403);

      // The "to discuss" flag is a shared session-level marker: either member may
      // toggle it. Other edits remain owner-only.
      const keys = Object.keys(data);
      const isOnlyFlagUpdate =
        keys.length > 0 && keys.every((k) => k === "toDiscuss");
      if (expense.addedById !== userId && !isOnlyFlagUpdate)
        throw new TxError("Vous ne pouvez modifier que vos propres dépenses.", 403);

      if (expense.session.status === "CLOSED")
        throw new TxError("La session est fermée.", 400);

      return tx.expense.update({
        where: { id: expenseId },
        data: {
          ...data,
          date: data.date ? new Date(data.date) : undefined,
        },
        include: {
          addedBy: { select: { id: true, name: true, image: true } },
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
    logServerError("expense-update", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, expenseId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({
        where: { id: expenseId },
        include: { session: true },
      });

      if (!expense || expense.sessionId !== id)
        throw new TxError("Dépense introuvable.", 404);

      const isMember =
        expense.session.creatorId === userId ||
        expense.session.inviteeId === userId;
      if (!isMember) throw new TxError("Accès refusé.", 403);

      if (expense.addedById !== userId)
        throw new TxError("Vous ne pouvez supprimer que vos propres dépenses.", 403);
      if (expense.session.status === "CLOSED")
        throw new TxError("La session est fermée.", 400);

      await tx.expense.delete({ where: { id: expenseId } });
    });

    revalidatePath(`/sessions/${id}`);
    revalidatePath("/dashboard");

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof TxError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logServerError("expense-delete", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
