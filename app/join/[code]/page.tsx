import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { JoinClient } from "./join-client";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await auth();

  const expSession = await prisma.expenseSession.findUnique({
    where: { shareCode: code },
    select: {
      id: true,
      title: true,
      status: true,
      creatorId: true,
      inviteeId: true,
      creator: { select: { name: true } },
    },
  });

  if (!expSession) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16 text-center">
        <div>
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-xl font-bold mb-2">Lien invalide</h1>
          <p className="text-zinc-500">Ce lien d&apos;invitation n&apos;existe pas ou a expiré.</p>
        </div>
      </main>
    );
  }

  const userId = session?.user?.id;

  // Navigating to this page never mutates anything: joining requires the
  // explicit POST from the client, so a cross-site navigation cannot enrol the
  // visitor in an attacker's session.
  if (userId) {
    if (expSession.creatorId === userId) {
      redirect(`/sessions/${expSession.id}`);
    }
    if (expSession.inviteeId === userId) {
      redirect(`/sessions/${expSession.id}`);
    }
    if (expSession.inviteeId) {
      return (
        <main className="flex flex-1 items-center justify-center px-4 py-16 text-center">
          <div>
            <div className="text-4xl mb-4">🔒</div>
            <h1 className="text-xl font-bold mb-2">Session complète</h1>
            <p className="text-zinc-500">
              Cette session a déjà deux participants.
            </p>
          </div>
        </main>
      );
    }
  }

  return (
    <JoinClient
      sessionTitle={expSession.title}
      creatorName={expSession.creator.name ?? "Quelqu'un"}
      shareCode={code}
      authenticated={Boolean(userId)}
    />
  );
}
