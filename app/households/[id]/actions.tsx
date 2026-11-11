"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface BaseProps {
  householdId: string;
}

interface MainProps extends BaseProps {
  shareCode: string;
  isOwner: boolean;
  canLeave: boolean;
}

interface RemoveMemberProps extends BaseProps {
  memberId: string;
}

export function RemoveMemberButton(props: RemoveMemberProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch(
      `/api/households/${props.householdId}/members/${props.memberId}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erreur.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={remove}
        disabled={busy}
        className="text-zinc-400 hover:text-red-500"
      >
        {busy ? "…" : "Retirer"}
      </Button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

export function HouseholdActions(props: MainProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<
    null | "leave" | "delete"
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { shareCode, isOwner, canLeave } = props;

  async function copy() {
    const base = window.location.origin;
    await navigator.clipboard.writeText(`${base}/foyer/join/${shareCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function leave() {
    setBusy(true);
    const res = await fetch(
      `/api/households/${props.householdId}/leave`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (res.ok) {
      router.push("/households");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Erreur lors de la sortie.");
    setConfirming(null);
  }

  async function deleteHousehold() {
    setBusy(true);
    const res = await fetch(`/api/households/${props.householdId}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (res.ok) {
      router.push("/households");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Erreur.");
    setConfirming(null);
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/sessions/new?household=${props.householdId}`}>
            + Nouvelle session dans ce foyer
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? "✓ Copié !" : "🔗 Copier le lien"}
        </Button>
        {canLeave && !confirming && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming("leave")}
            className="text-zinc-500 hover:text-red-500"
          >
            Quitter le foyer
          </Button>
        )}
        {isOwner && !confirming && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming("delete")}
            className="text-zinc-500 hover:text-red-500"
          >
            Supprimer le foyer
          </Button>
        )}
      </div>

      {confirming === "leave" && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-2">
          <p className="text-sm text-red-700 dark:text-red-400">
            Quitter ce foyer ? Vous ne pourrez plus créer de sessions pré-assignées
            à ses membres.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(null)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={leave}
              disabled={busy}
            >
              {busy ? "Sortie…" : "Confirmer"}
            </Button>
          </div>
        </div>
      )}

      {confirming === "delete" && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-2">
          <p className="text-sm text-red-700 dark:text-red-400">
            Supprimer définitivement ce foyer ? Les sessions créées depuis
            celui-ci resteront mais perdront leur lien au foyer.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(null)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={deleteHousehold}
              disabled={busy}
            >
              {busy ? "Suppression…" : "Supprimer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
