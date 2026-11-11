"use client";

import { useRef, useState } from "react";
import {
  CircleExclamationPoint,
  FileUp,
  LoaderCircle,
  Lock,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/calculations";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".csv", ".txt"];

type Phase = "select" | "analyzing" | "preview";

type ApiSuggestion = {
  label: string;
  amount: number;
  date: string | null;
  isShared: boolean;
  confidence: number;
  reason: string;
  duplicate: boolean;
};

type PreviewRow = {
  key: string;
  include: boolean;
  label: string;
  amount: string;
  date: string;
  isShared: boolean;
  confidence: number;
  reason: string;
  duplicate: boolean;
};

type ImportResponse = {
  expenses?: ApiSuggestion[];
  error?: string;
};

type Props = {
  sessionId: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

function confidenceBadge(confidence: number): {
  label: string;
  className: string;
} {
  if (confidence >= 0.8) {
    return {
      label: "Confiance haute",
      className:
        "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
    };
  }
  if (confidence >= 0.5) {
    return {
      label: "Confiance moyenne",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    };
  }
  return {
    label: "Confiance basse",
    className:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };
}

export function ImportStatementDialog({
  sessionId,
  currency,
  open,
  onOpenChange,
  onImported,
}: Props) {
  const [phase, setPhase] = useState<Phase>("select");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analyzeRequestRef = useRef(0);

  function reset() {
    analyzeRequestRef.current += 1;
    setPhase("select");
    setFile(null);
    setRows([]);
    setError("");
    setSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    if (!selected) {
      setFile(null);
      return;
    }

    const lowerName = selected.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      setError("Format non pris en charge. Choisissez un fichier PDF, CSV ou TXT.");
      setFile(null);
      event.target.value = "";
      return;
    }
    if (selected.size === 0) {
      setError("Le fichier est vide.");
      setFile(null);
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setError("Le fichier dépasse la taille maximale de 4 Mo.");
      setFile(null);
      event.target.value = "";
      return;
    }

    setFile(selected);
  }

  async function analyze() {
    if (!file) return;
    const requestId = ++analyzeRequestRef.current;
    setPhase("analyzing");
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/sessions/${sessionId}/import-statement`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as ImportResponse;
      if (requestId !== analyzeRequestRef.current) return;
      if (!res.ok) {
        throw new Error(data.error ?? "L'analyse du relevé a échoué.");
      }

      const suggestions = Array.isArray(data.expenses) ? data.expenses : [];
      setRows(
        suggestions.map((suggestion, index) => ({
          key: `${Date.now()}-${index}`,
          include: !suggestion.duplicate,
          label: suggestion.label,
          amount: String(suggestion.amount),
          date: suggestion.date ?? "",
          isShared: suggestion.isShared,
          confidence: suggestion.confidence,
          reason: suggestion.reason,
          duplicate: suggestion.duplicate,
        }))
      );
      setPhase("preview");
    } catch (err) {
      if (requestId !== analyzeRequestRef.current) return;
      setError(
        err instanceof Error ? err.message : "L'analyse du relevé a échoué."
      );
      setPhase("select");
    }
  }

  function updateRow(key: string, patch: Partial<PreviewRow>) {
    setRows((previous) =>
      previous.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  function chooseAnotherFile() {
    setPhase("select");
    setFile(null);
    setRows([]);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const selectedRows = rows.filter((row) => {
    const amount = Number.parseFloat(row.amount);
    return row.include && row.label.trim().length > 0 && amount > 0;
  });

  const totalSelected = selectedRows.reduce((sum, row) => {
    const amount = Number.parseFloat(row.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  async function submit() {
    if (selectedRows.length === 0) {
      setError("Sélectionnez au moins une dépense à ajouter.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${sessionId}/expenses/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenses: selectedRows.map((row) => ({
            label: row.label.trim(),
            amount: Number.parseFloat(row.amount),
            date: row.date
              ? new Date(`${row.date}T00:00:00`).toISOString()
              : undefined,
            isShared: row.isShared,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "L'ajout des dépenses a échoué.");
      }

      reset();
      onOpenChange(false);
      onImported();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "L'ajout des dépenses a échoué."
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer un relevé</DialogTitle>
          <DialogDescription>
            PDF, CSV ou TXT — 4 Mo maximum. Les débits sont extraits et
            pré-classés en dépenses partagées ou privées.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-300">
            <CircleExclamationPoint className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {phase === "select" && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain"
              onChange={pickFile}
              className="sr-only"
              aria-label="Choisir un relevé bancaire"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-8 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/50"
            >
              <FileUp className="h-8 w-8 text-zinc-400" />
              <span className="text-sm font-medium">
                {file ? file.name : "Choisir un fichier"}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                {file
                  ? `${(file.size / 1024).toFixed(0)} Ko`
                  : "PDF, CSV ou TXT · 4 Mo maximum"}
              </span>
            </button>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Annuler
              </Button>
              <Button type="button" onClick={analyze} disabled={!file}>
                Analyser le relevé
              </Button>
            </DialogFooter>
          </div>
        )}

        {phase === "analyzing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <LoaderCircle className="h-8 w-8 animate-spin text-zinc-400" />
            <p className="text-sm font-medium">Analyse du relevé en cours…</p>
            <p className="max-w-sm text-xs text-zinc-400 dark:text-zinc-500">
              L&apos;IA extrait les débits et propose une classification à
              partir de vos sessions passées.
            </p>
          </div>
        )}

        {phase === "preview" && (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="truncate">{file?.name}</span>
              <button
                type="button"
                onClick={chooseAnotherFile}
                className="shrink-0 font-medium underline-offset-2 hover:underline"
              >
                Changer de fichier
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">
                Aucun débit détecté dans ce relevé.
              </p>
            ) : (
              <div className="-mx-1 max-h-[50vh] space-y-2 overflow-y-auto px-1">
                {rows.map((row) => {
                  const badge = confidenceBadge(row.confidence);
                  return (
                    <div
                      key={row.key}
                      className={cn(
                        "space-y-2 rounded-lg border p-3 transition-opacity",
                        row.include
                          ? "border-zinc-200 dark:border-zinc-700"
                          : "border-zinc-200 opacity-50 dark:border-zinc-700",
                        row.duplicate &&
                          "border-amber-300 dark:border-amber-800"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={(e) =>
                            updateRow(row.key, { include: e.target.checked })
                          }
                          className="mt-2.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
                          aria-label={`Inclure ${row.label}`}
                        />
                        <Input
                          value={row.label}
                          onChange={(e) =>
                            updateRow(row.key, { label: e.target.value })
                          }
                          className="h-9"
                          aria-label="Libellé"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[7rem_9rem_1fr]">
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(e) =>
                            updateRow(row.key, { amount: e.target.value })
                          }
                          className="h-9"
                          aria-label="Montant"
                        />
                        <Input
                          type="date"
                          value={row.date}
                          onChange={(e) =>
                            updateRow(row.key, { date: e.target.value })
                          }
                          className="h-9"
                          aria-label="Date"
                        />
                        <button
                          type="button"
                          aria-pressed={row.isShared}
                          onClick={() =>
                            updateRow(row.key, { isShared: !row.isShared })
                          }
                          className={cn(
                            "flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors",
                            row.isShared
                              ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300"
                              : "border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                          )}
                        >
                          {row.isShared ? (
                            <>
                              <Users className="h-3.5 w-3.5" />
                              Partagée
                            </>
                          ) : (
                            <>
                              <Lock className="h-3.5 w-3.5" />
                              Privée
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                        {row.duplicate && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                            Doublon probable
                          </span>
                        )}
                        {row.reason && (
                          <span
                            className="min-w-0 truncate text-[11px] text-zinc-400 dark:text-zinc-500"
                            title={row.reason}
                          >
                            {row.reason}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-700">
              <span className="text-zinc-500 dark:text-zinc-400">
                {selectedRows.length} sélectionnée
                {selectedRows.length > 1 ? "s" : ""}
              </span>
              <span className="font-semibold">
                {formatCurrency(totalSelected, currency)}
              </span>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={submit}
                disabled={submitting || selectedRows.length === 0}
              >
                {submitting
                  ? "Ajout…"
                  : `Ajouter ${selectedRows.length} dépense${
                      selectedRows.length > 1 ? "s" : ""
                    }`}
              </Button>
            </DialogFooter>
          </div>
        )}

        <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
          Le relevé est analysé par une IA ; vérifiez les dépenses avant de les
          ajouter.
        </p>
      </DialogContent>
    </Dialog>
  );
}
