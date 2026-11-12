"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  sessionTitle: string;
  creatorName: string;
  shareCode: string;
  authenticated: boolean;
}

export function JoinClient({
  sessionTitle,
  creatorName,
  shareCode,
  authenticated,
}: Props) {
  const callbackUrl = `/join/${shareCode}`;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/join/${shareCode}`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        redirect?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Impossible de rejoindre cette session.");
        setBusy(false);
        return;
      }
      router.push(data.redirect ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Impossible de rejoindre cette session.");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="text-3xl mb-2">🤝</div>
          <CardTitle>Vous avez été invité !</CardTitle>
          <CardDescription>
            <strong>{creatorName}</strong> vous invite à rejoindre la session{" "}
            <strong>&ldquo;{sessionTitle}&rdquo;</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {authenticated ? (
            <Button className="w-full" onClick={join} disabled={busy}>
              {busy ? "Connexion…" : "Rejoindre la session"}
            </Button>
          ) : (
            <>
              <p className="text-sm text-zinc-500">
                Connectez-vous pour rejoindre la session et ajouter vos dépenses.
              </p>
              <Button
                className="w-full gap-2"
                onClick={() => signIn("google", { callbackUrl })}
              >
                <GoogleIcon />
                Continuer avec Google
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => signIn("discord", { callbackUrl })}
              >
                <DiscordIcon />
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
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.054a19.9 19.9 0 0 0 5.993 3.031.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
