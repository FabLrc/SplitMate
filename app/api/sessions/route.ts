import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { z } from "zod";
import { sendPushToUser } from "@/lib/push";

const createSessionSchema = z.object({
  title: z.string().min(1).max(200),
  defaultSplitRatio: z.number().min(0).max(1).default(0.5),
  currency: z.string().length(3).default("EUR"),
  // Pre-assign an invitee from a shared household.
  inviteeId: z.string().min(1).optional(),
  householdId: z.string().min(1).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const sessions = await prisma.expenseSession.findMany({
    where: {
      OR: [
        { creatorId: session.user.id },
        { inviteeId: session.user.id },
      ],
    },
    include: {
      creator: { select: { id: true, name: true, image: true } },
      invitee: { select: { id: true, name: true, image: true } },
      expenses: { select: { id: true, amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = createSessionSchema.parse(body);

    // If a household invitee is supplied, validate that both users are members
    // of the same household before pre-assigning.
    if (data.inviteeId || data.householdId) {
      if (!data.inviteeId || !data.householdId) {
        return NextResponse.json(
          {
            error:
              "Pour pré-assigner un invité via un foyer, indiquez foyer et membre.",
          },
          { status: 400 }
        );
      }
      if (data.inviteeId === session.user.id) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas vous inviter vous-même." },
          { status: 400 }
        );
      }
      const shared = await prisma.householdMember.count({
        where: {
          householdId: data.householdId,
          userId: { in: [session.user.id, data.inviteeId] },
        },
      });
      if (shared !== 2) {
        return NextResponse.json(
          { error: "Le membre choisi n'appartient pas à ce foyer." },
          { status: 400 }
        );
      }
    }

    const expenseSession = await prisma.expenseSession.create({
      data: {
        title: data.title,
        defaultSplitRatio: data.defaultSplitRatio,
        currency: data.currency,
        shareCode: nanoid(8),
        creatorId: session.user.id,
        inviteeId: data.inviteeId ?? null,
        householdId: data.householdId ?? null,
      },
      include: {
        creator: { select: { id: true, name: true, image: true } },
        invitee: { select: { id: true, name: true, image: true } },
      },
    });

    revalidatePath("/dashboard");

    if (data.inviteeId) {
      const origin =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
        req.nextUrl.origin;
      const url = new URL(`/sessions/${expenseSession.id}`, origin).toString();
      sendPushToUser(data.inviteeId, {
        title: "Nouvelle session",
        body: `${session.user.name ?? "Quelqu'un"} vous a ajouté à "${data.title}".`,
        url,
      }).catch((err) => console.error("push notify failed:", err));
    }

    return NextResponse.json(expenseSession, { status: 201 });
  } catch (error) {
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
