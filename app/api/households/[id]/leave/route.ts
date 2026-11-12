import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/households/[id]/leave — current user leaves the household.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const membership = await prisma.householdMember.findUnique({
    where: {
      householdId_userId: { householdId: id, userId: session.user.id },
    },
  });
  if (!membership)
    return NextResponse.json({ error: "Pas membre." }, { status: 404 });

  if (membership.role === "OWNER") {
    return NextResponse.json(
      {
        error:
          "Le propriétaire doit supprimer le foyer (utilisez la suppression).",
      },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.householdMember.delete({
      where: {
        householdId_userId: {
          householdId: id,
          userId: session.user.id,
        },
      },
    }),
    // The link must not let the departing member walk back in.
    prisma.household.update({
      where: { id },
      data: { shareCode: nanoid(8) },
    }),
  ]);

  revalidatePath("/households");
  revalidatePath(`/households/${id}`);
  revalidatePath("/dashboard");

  return new NextResponse(null, { status: 204 });
}
