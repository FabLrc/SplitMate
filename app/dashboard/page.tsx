import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/auth";
import { formatCurrency } from "@/lib/calculations";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionActions } from "./session-actions";
import { DashboardRefresh } from "./dashboard-refresh";
import { LinkDiscordButton } from "@/components/link-discord-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);

  const userId = session.user.id;

  const [sessions, totalCount, discordAccount] = await Promise.all([
    prisma.expenseSession.findMany({
      where: { OR: [{ creatorId: userId }, { inviteeId: userId }] },
      include: {
        creator: { select: { id: true, name: true } },
        invitee: { select: { id: true, name: true } },
        expenses: { select: { id: true, amount: true, isShared: true } },
        household: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.expenseSession.count({
      where: { OR: [{ creatorId: userId }, { inviteeId: userId }] },
    }),
    prisma.account.findFirst({
      where: { userId, provider: "discord" },
      select: { provider: true },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const discordLinked = discordAccount !== null;

  return (
    <div className="min-h-screen dark:bg-zinc-900">
      <DashboardRefresh />
      <header className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-bold">
            💸 SplitMate
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/households">🏠 Foyers</Link>
            </Button>
            <span className="text-sm text-zinc-500 dark:text-zinc-200">
              {session.user.name ?? session.user.email}
            </span>
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button variant="ghost" size="sm" type="submit">
                Déconnexion
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mes sessions</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
              {totalCount === 0
                ? "Aucune session pour le moment"
                : `${totalCount} session${totalCount > 1 ? "s" : ""}`}
            </p>
          </div>
          <Button asChild>
            <Link href="/sessions/new">+ Nouvelle session</Link>
          </Button>
        </div>

        {totalCount === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <div className="text-4xl mb-4">🤝</div>
              <p className="text-zinc-500 dark:text-zinc-400 mb-4">
                Créez votre première session pour commencer à partager vos dépenses.
              </p>
              <Button asChild>
                <Link href="/sessions/new">Créer une session</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {sessions.map((s) => {
                const sharedExpenses = s.expenses.filter((e) => e.isShared);
                const privateCount = s.expenses.length - sharedExpenses.length;
                const totalAmount = sharedExpenses.reduce(
                  (sum, e) => sum + e.amount,
                  0
                );
                const isCreator = s.creatorId === userId;
                const partner = isCreator ? s.invitee : s.creator;

                return (
                  <Card
                    key={s.id}
                    className="relative hover:shadow-md transition-shadow"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          <Link
                            href={`/sessions/${s.id}`}
                            className="rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500"
                          >
                            {s.title}
                          </Link>
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              s.status === "OPEN"
                                ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                                : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                            }`}
                          >
                            {s.status === "OPEN" ? "Active" : "Fermée"}
                          </span>
                          <div className="relative z-10">
                            <SessionActions sessionId={s.id} isCreator={isCreator} />
                          </div>
                        </div>
                      </div>
                      <CardDescription>
                        {partner
                          ? `Avec ${partner.name ?? "Invité"}`
                          : "En attente d'un invité"}
                        {s.household && (
                          <Link
                            href={`/households/${s.household.id}`}
                            className="relative z-10 ml-2 inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                          >
                            🏠 {s.household.name}
                          </Link>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                        <span>
                          {sharedExpenses.length} partagée
                          {sharedExpenses.length > 1 ? "s" : ""}
                          {privateCount > 0
                            ? ` · ${privateCount} privée${privateCount > 1 ? "s" : ""}`
                            : ""}
                        </span>
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(totalAmount, s.currency)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Page {page} sur {totalPages}
                </p>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard?page=${page - 1}`}>← Précédent</Link>
                    </Button>
                  )}
                  {page < totalPages && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard?page=${page + 1}`}>Suivant →</Link>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Connexion Discord</CardTitle>
            <CardDescription>
              {discordLinked
                ? "Votre compte Discord est lié à SplitMate."
                : "Connectez-vous avec votre méthode habituelle, puis liez votre compte Discord une fois."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {discordLinked ? (
              <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                Discord lié
              </span>
            ) : (
              <LinkDiscordButton />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
