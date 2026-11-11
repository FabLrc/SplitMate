import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="max-w-md space-y-6">
        <div className="text-5xl">💸</div>
        <h1 className="text-3xl font-bold tracking-tight">SplitMate</h1>
        <p className="text-zinc-500 text-lg leading-relaxed">
          Partagez vos dépenses simplement. Créez une session, invitez votre
          partenaire, et voyez instantanément qui doit quoi à qui.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/auth/signin">Se connecter</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/auth/register">Créer un compte</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
