import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { JoinClient } from "./join-client";

export default async function JoinHouseholdPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await auth();

  const household = await prisma.household.findUnique({
    where: { shareCode: code },
    select: {
      id: true,
      name: true,
      createdBy: { select: { name: true } },
      members: {
        select: { userId: true },
      },
    },
  });

  if (!household) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16 text-center">
        <div>
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-xl font-bold mb-2">Lien invalide</h1>
          <p className="text-zinc-500">
            Ce lien d&apos;invitation de foyer n&apos;existe pas ou a expiré.
          </p>
        </div>
      </main>
    );
  }

  const userId = session?.user?.id;
  const alreadyMember = Boolean(
    userId && household.members.some((member) => member.userId === userId)
  );

  if (userId && alreadyMember) {
    redirect(`/households/${household.id}`);
  }

  // No mutation on GET: membership is only created by the explicit POST from
  // the client, so a cross-site navigation cannot enrol the visitor.
  return (
    <JoinClient
      householdName={household.name}
      inviterName={household.createdBy.name ?? "Quelqu'un"}
      shareCode={code}
      authenticated={Boolean(userId)}
    />
  );
}
