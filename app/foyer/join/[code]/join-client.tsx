"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  householdName: string;
  inviterName: string;
  shareCode: string;
}

export function JoinClient({ householdName, inviterName, shareCode }: Props) {
  const callbackUrl = `/foyer/join/${shareCode}`;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="text-3xl mb-2">🏠</div>
          <CardTitle>Rejoindre un foyer</CardTitle>
          <CardDescription>
            <strong>{inviterName}</strong> vous invite à rejoindre le foyer{" "}
            <strong>&ldquo;{householdName}&rdquo;</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-500">
            Connectez-vous pour rejoindre le foyer et créer des sessions pré-assignées
            à ses membres.
          </p>
          <Button
            className="w-full gap-2"
            onClick={() => signIn("google", { callbackUrl })}
          >
            Continuer avec Google
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => signIn("discord", { callbackUrl })}
          >
            Continuer avec Discord
          </Button>
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-zinc-400">ou</span>
            </div>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
              Se connecter avec un email
            </Link>
          </Button>
          <Button asChild variant="ghost" className="w-full text-sm">
            <Link href={`/auth/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
              Pas de compte ? S&apos;inscrire
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
