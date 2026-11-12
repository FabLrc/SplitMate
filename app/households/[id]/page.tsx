import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { HouseholdActions, RemoveMemberButton } from "./actions";

export const dynamic = "force-dynamic";

export default async function HouseholdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/auth/signin");

  const household = await prisma.household.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, image: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
      sessions: {
        // Sessions of the household are private to their two members.
        where: { OR: [{ creatorId: userId }, { inviteeId: userId }] },
        select: { id: true, title: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!household) notFound();

  const myMembership = household.members.find(
    (m) => m.userId === userId
  );
  if (!myMembership) redirect("/households");

  const isOwner = myMembership.role === "OWNER";

  return (
    <div className="min-h-screen dark:bg-zinc-900">
      <header className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/households"
            className="text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 text-sm shrink-0"
          >
            ← Foyers
          </Link>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span className="text-sm font-medium truncate">{household.name}</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{household.name}</CardTitle>
              {isOwner && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                  Propriétaire
                </span>
              )}
            </div>
            <CardDescription>
              {household.members.length} membre
              {household.members.length > 1 ? "s" : ""} · créé par{" "}
              {household.createdBy.name ?? "quelqu&apos;un"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <HouseholdActions
              householdId={household.id}
              shareCode={household.shareCode}
              isOwner={isOwner}
              canLeave={!isOwner}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Membres</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {household.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between py-3 gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {m.user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.user.image}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m.user.name ?? "Invité"}
                        {m.userId === userId && (
                          <span className="text-xs text-zinc-400 ml-2">
                            (vous)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {m.role === "OWNER" ? "Propriétaire" : "Membre"}
                      </p>
                    </div>
                  </div>
                  {isOwner && m.userId !== userId && (
                    <RemoveMemberButton
                      householdId={household.id}
                      memberId={m.userId}
                    />
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {household.sessions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Sessions créées depuis ce foyer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {household.sessions.map((s) => (
                  <li key={s.id} className="py-2">
                    <Link
                      href={`/sessions/${s.id}`}
                      className="text-sm hover:underline"
                    >
                      {s.title}
                    </Link>
                    <span className="text-xs text-zinc-400 ml-2">
                      {new Date(s.createdAt).toLocaleDateString("fr-FR")}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
