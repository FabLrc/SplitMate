import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { z } from "zod";
import { logServerError } from "@/lib/log";

const createHouseholdSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const memberships = await prisma.householdMember.findMany({
    where: { userId: session.user.id },
    include: {
      household: {
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, image: true } },
            },
            orderBy: { joinedAt: "asc" },
          },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  // Flatten members to their user objects — this endpoint feeds the
  // "create session with a household member" picker, which needs user ids.
  return NextResponse.json(
    memberships.map((m) => ({
      id: m.household.id,
      name: m.household.name,
      shareCode: m.household.shareCode,
      members: m.household.members.map((mm) => ({
        id: mm.user.id,
        name: mm.user.name,
        image: mm.user.image,
        isSelf: mm.userId === session.user!.id,
      })),
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name } = createHouseholdSchema.parse(body);

    const household = await prisma.household.create({
      data: {
        name,
        shareCode: nanoid(8),
        createdById: session.user.id,
        members: {
          create: {
            userId: session.user.id,
            role: "OWNER",
          },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });

    revalidatePath("/households");
    revalidatePath("/dashboard");

    return NextResponse.json(household, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Données invalides.", issues: error.issues },
        { status: 400 }
      );
    }
    logServerError("household-create", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
