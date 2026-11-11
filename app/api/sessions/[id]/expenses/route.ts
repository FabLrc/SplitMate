import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const addExpenseSchema = z.object({
  label: z.string().min(1).max(200),
  amount: z.number().positive(),
  splitRatio: z.number().min(0).max(1).nullable().optional(),
  date: z.string().datetime().optional(),
  toDiscuss: z.boolean().optional(),
  isShared: z.boolean().optional(),
});

export async function POST(
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
    const data = addExpenseSchema.parse(body);

    const expense = await prisma.$transaction(async (tx) => {
      const expSession = await tx.expenseSession.findUnique({
        where: { id },
      });
      if (!expSession) throw new TxError("Session introuvable.", 404);

      const isMember =
        expSession.creatorId === userId ||
        expSession.inviteeId === userId;
      if (!isMember) throw new TxError("Accès refusé.", 403);
      if (expSession.status === "CLOSED")
        throw new TxError("La session est fermée.", 400);

      return tx.expense.create({
        data: {
          label: data.label,
          amount: data.amount,
          splitRatio: data.splitRatio ?? null,
          date: data.date ? new Date(data.date) : new Date(),
          sessionId: id,
          addedById: userId,
          toDiscuss: data.toDiscuss ?? false,
          isShared: data.isShared ?? true,
        },
        include: {
          addedBy: { select: { id: true, name: true, image: true } },
        },
      });
    });

    revalidatePath(`/sessions/${id}`);
    revalidatePath("/dashboard");

    return NextResponse.json(expense, { status: 201 });
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
    console.error(error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

class TxError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
