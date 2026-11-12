import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";

type Params = { params: Promise<{ id: string }> };

// POST /api/households/[id]/rotate-share — owner revokes the current invite
// link by generating a new share code.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const membership = await prisma.householdMember.findUnique({
    where: {
      householdId_userId: { householdId: id, userId: session.user.id },
    },
    select: { role: true },
  });

  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json(
      { error: "Seul le propriétaire peut renouveler le lien." },
      { status: 403 }
    );
  }

  const household = await prisma.household.update({
    where: { id },
    data: { shareCode: nanoid(8) },
    select: { shareCode: true },
  });

  revalidatePath("/households");
  revalidatePath(`/households/${id}`);

  return NextResponse.json({ shareCode: household.shareCode });
}
