import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const bulkExpenseSchema = z.object({
  expenses: z
    .array(
      z.object({
        label: z.string().min(1).max(200),
        amount: z.number().positive(),
        date: z.string().datetime().optional(),
        splitRatio: z.number().min(0).max(1).nullable().optional(),
        toDiscuss: z.boolean().optional(),
        isShared: z.boolean().optional(),
      })
    )
    .min(1)
    .max(200),
});

class TxError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

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
    const data = bulkExpenseSchema.parse(body);

    const created = await prisma.$transaction(async (tx) => {
      const expSession = await tx.expenseSession.findUnique({
        where: { id },
        select: { creatorId: true, inviteeId: true, status: true },
      });
      if (!expSession) throw new TxError("Session introuvable.", 404);

      const isMember =
        expSession.creatorId === userId || expSession.inviteeId === userId;
      if (!isMember) throw new TxError("Accès refusé.", 403);
      if (expSession.status === "CLOSED")
        throw new TxError("La session est fermée.", 400);

      const now = new Date();
      const result = await tx.expense.createMany({
        data: data.expenses.map((expense) => ({
          label: expense.label,
          amount: expense.amount,
          splitRatio: expense.splitRatio ?? null,
          date: expense.date ? new Date(expense.date) : now,
          toDiscuss: expense.toDiscuss ?? false,
          isShared: expense.isShared ?? true,
          sessionId: id,
          addedById: userId,
        })),
      });

      return result.count;
    });

    revalidatePath(`/sessions/${id}`);
    revalidatePath("/dashboard");

    return NextResponse.json({ created }, { status: 201 });
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
    console.error(
      "bulk expenses: unexpected failure",
      error instanceof Error ? error.name : "unknown error"
    );
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
