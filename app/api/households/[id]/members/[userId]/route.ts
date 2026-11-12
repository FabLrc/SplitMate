import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";

type Params = { params: Promise<{ id: string; userId: string }> };

// DELETE /api/households/[id]/members/[userId]
//   - if userId === current user  → leave the household
//   - else                         → remove a member (OWNER only)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, userId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const isSelf = userId === session.user.id;
  if (!isSelf) {
    const requester = await prisma.householdMember.findUnique({
      where: {
        householdId_userId: { householdId: id, userId: session.user.id },
      },
    });
    if (!requester || requester.role !== "OWNER") {
      return NextResponse.json(
        { error: "Seul le propriétaire peut retirer un membre." },
        { status: 403 }
      );
    }
  }

  const existing = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: id, userId } },
  });
  if (!existing)
    return NextResponse.json({ error: "Membre introuvable." }, { status: 404 });

  // OWNER cannot leave their own household — they must delete it instead.
  if (isSelf && existing.role === "OWNER") {
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
        householdId_userId: { householdId: id, userId },
      },
    }),
    // A removed member must not be able to rejoin with the link they kept.
    prisma.household.update({
      where: { id },
      data: { shareCode: nanoid(8) },
    }),
  ]);

  revalidatePath(`/households/${id}`);
  revalidatePath("/households");
  revalidatePath("/dashboard");

  return new NextResponse(null, { status: 204 });
}
