"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD"];

type SessionType = "classic" | "household";

type HouseholdMember = {
  id: string;
  name: string | null;
  image: string | null;
  isSelf: boolean;
};

type Household = {
  id: string;
  name: string;
  shareCode: string;
  members: HouseholdMember[];
};

export function NewSessionForm({
  preselectHousehold,
}: {
  preselectHousehold: string | null;
}) {
  const [type, setType] = useState<SessionType>(
    preselectHousehold ? "household" : "classic"
  );
  const [form, setForm] = useState({
    title: "",
    defaultSplitRatio: 50,
    currency: "EUR",
    householdId: preselectHousehold ?? "",
    inviteeId: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdsLoaded, setHouseholdsLoaded] = useState(false);
  const householdsLoadingRef = useRef(false);

  useEffect(() => {
    if (type !== "household" || householdsLoaded || householdsLoadingRef.current)
      return;
    householdsLoadingRef.current = true;
    fetch("/api/households")
      .then((r) => r.json())
      .then((data: Household[]) => setHouseholds(data ?? []))
      .catch(() => setHouseholds([]))
      .finally(() => setHouseholdsLoaded(true));
  }, [type, householdsLoaded]);

  const selectedHousehold =
    households.find((h) => h.id === form.householdId) ?? null;
  const selectableMembers = (selectedHousehold?.members ?? []).filter(
    (m) => !m.isSelf
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const body: Record<string, unknown> = {
      title: form.title,
      defaultSplitRatio: form.defaultSplitRatio / 100,
      currency: form.currency,
    };
    if (type === "household") {
      body.householdId = form.householdId;
      body.inviteeId = form.inviteeId;
    }

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erreur lors de la création.");
      setLoading(false);
      return;
    }

    const session = await res.json();
    window.location.href = `/sessions/${session.id}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle session</CardTitle>
        <CardDescription>
          Définissez les paramètres de votre session de dépenses partagées.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Session type */}
          <div className="space-y-1.5">
            <Label>Type de session</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("classic")}
                className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                  type === "classic"
                    ? "border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                    : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                }`}
              >
                <div className="font-medium">🔗 Classique</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Invitez quelqu&apos;un via un lien.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setType("household")}
                className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                  type === "household"
                    ? "border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                    : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                }`}
              >
                <div className="font-medium">🏠 Foyer</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Pré-assignez un membre de votre foyer.
                </div>
              </button>
            </div>
          </div>

          {/* Household selectors */}
          {type === "household" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="household">Foyer</Label>
                {!householdsLoaded ? (
                  <p className="text-sm text-zinc-500">Chargement…</p>
                ) : households.length === 0 ? (
                  <p className="text-sm text-zinc-500 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Vous n&apos;avez pas encore de foyer.{" "}
                    <Link
                      href="/households"
                      className="text-amber-700 dark:text-amber-300 underline font-medium"
                    >
                      Créer un foyer
                    </Link>
                  </p>
                ) : (
                  <select
                    id="household"
                    value={form.householdId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        householdId: e.target.value,
                        inviteeId: "",
                      })
                    }
                    className="flex h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400"
                    required
                  >
                    <option value="">— Choisir un foyer —</option>
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.members.length} membres)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {form.householdId && (
                <div className="space-y-1.5">
                  <Label htmlFor="member">Membre à pré-assigner</Label>
                  {selectableMembers.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                      Ce foyer n&apos;a pas d&apos;autre membre. Invitez-en via
                      le lien d&apos;invitation du foyer.{" "}
                      <Link
                        href={`/households/${form.householdId}`}
                        className="text-amber-700 dark:text-amber-300 underline font-medium"
                      >
                        Gérer le foyer
                      </Link>
                    </p>
                  ) : (
                  <select
                    id="member"
                    value={form.inviteeId}
                    onChange={(e) =>
                      setForm({ ...form, inviteeId: e.target.value })
                    }
                    className="flex h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400"
                    required
                  >
                    <option value="">— Choisir un membre —</option>
                    {selectableMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name ?? "Invité"}
                      </option>
                    ))}
                  </select>
                  )}
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="title">Nom de la session</Label>
            <Input
              id="title"
              placeholder="Ex: Vacances été 2025, Loyer mars…"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Devise</Label>
            <select
              id="currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="flex h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-400"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="split">
              Répartition par défaut — vous payez{" "}
              <span className="font-bold text-zinc-900">{form.defaultSplitRatio}%</span>
            </Label>
            <input
              id="split"
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.defaultSplitRatio}
              onChange={(e) =>
                setForm({ ...form, defaultSplitRatio: Number(e.target.value) })
              }
              className="w-full accent-zinc-900 dark:accent-zinc-100 h-2 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-zinc-400">
              <span>0% (l&apos;autre paie tout)</span>
              <span>50/50</span>
              <span>100% (vous payez tout)</span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/dashboard">Annuler</Link>
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Création…" : "Créer la session"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
