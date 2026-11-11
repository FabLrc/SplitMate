"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ExpenseLabelInput } from "@/components/expense-label-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/calculations";
import type { SessionSummary } from "@/lib/calculations";
import type { Expense, ExpenseSession, User } from "@prisma/client";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type UserInfo = Pick<User, "id" | "name" | "image">;
type ExpenseWithAdder = Expense & { addedBy: UserInfo };
type SessionWithRelations = ExpenseSession & {
  creator: UserInfo;
  invitee: UserInfo | null;
  expenses: ExpenseWithAdder[];
};

interface Props {
  expSession: SessionWithRelations;
  currentUserId: string;
  summary: SessionSummary | null;
  shareUrl: string;
  currency: string;
}

type Tab = "expenses" | "summary";

function DatePicker({
  value,
  onChange,
}: {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-left text-sm",
            "dark:border-zinc-700 dark:bg-zinc-950",
            "hover:bg-zinc-50 dark:hover:bg-zinc-800",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
            "transition-colors",
            !selected && "text-zinc-400 dark:text-zinc-500"
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
          {selected
            ? format(selected, "d MMMM yyyy", { locale: fr })
            : "Choisir une date"}
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, "yyyy-MM-dd"));
              setOpen(false);
            }
          }}
          defaultMonth={selected}
        />
      </PopoverContent>
    </Popover>
  );
}

export function SessionView({
  expSession: initialSession,
  currentUserId,
  summary: initialSummary,
  shareUrl,
  currency,
}: Props) {
  const fmt = (amount: number) => formatCurrency(amount, currency);
  const [session, setSession] = useState(initialSession);
  const [tab, setTab] = useState<Tab>("expenses");
  const [copied, setCopied] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-refresh: near-real-time poll (3s) + refetch on window focus.
  // Polling is skipped while the tab is hidden to avoid wasted requests; the
  // focus/visibility listeners trigger an immediate refresh when the user comes
  // back, so the data is fresh the moment the tab is visible again.
  const refreshing = useRef(false);
  const refreshSession = useCallback(async () => {
    if (refreshing.current || document.hidden) return;
    refreshing.current = true;
    try {
      const res = await fetch(`/api/sessions/${initialSession.id}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data);
      }
    } catch {
      // silently ignore network errors during background refresh
    } finally {
      refreshing.current = false;
    }
  }, [initialSession.id]);

  useEffect(() => {
    // The first refresh goes through a timer so it does not set state during
    // the commit phase; it still fires well before the first 3s interval tick.
    const initialRefresh = setTimeout(refreshSession, 0);
    const interval = setInterval(refreshSession, 3_000);
    const onFocus = () => refreshSession();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshSession();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(initialRefresh);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshSession]);

  // Add expense
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    label: "",
    amount: "",
    splitRatio: "",
    date: new Date().toISOString().split("T")[0],
    toDiscuss: false,
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (showForm) titleRef.current?.focus();
  }, [showForm]);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Edit expense
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    label: string;
    amount: string;
    splitRatio: string;
    date: string;
    toDiscuss: boolean;
  }>({
    label: "",
    amount: "",
    splitRatio: "",
    date: "",
    toDiscuss: false,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Close session
  const [closingSession, setClosingSession] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // Settle balance
  const [settling, setSettling] = useState(false);

  // Edit default split ratio
  const [editingSplit, setEditingSplit] = useState(false);
  const [newSplitPct, setNewSplitPct] = useState("");
  const [splitConfirm, setSplitConfirm] = useState(false);
  const [splitSaving, setSplitSaving] = useState(false);
  const [splitError, setSplitError] = useState("");

  // Delete / Leave session
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  // Search
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [discussOnly, setDiscussOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  function closeSearch() {
    setSearch("");
    setShowSearch(false);
  }

  const isCreator = session.creatorId === currentUserId;
  const partner = isCreator ? session.invitee : session.creator;

  // "My share" of the default split — creator sees the ratio directly, invitee sees (1 - ratio)
  const myDefaultPct = Math.round(
    (isCreator ? session.defaultSplitRatio : 1 - session.defaultSplitRatio) * 100
  );

  async function copyShareLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");

    const res = await fetch(`/api/sessions/${session.id}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: formData.label,
        amount: parseFloat(formData.amount),
        splitRatio: formData.splitRatio
          ? (isCreator ? parseFloat(formData.splitRatio) / 100 : 1 - parseFloat(formData.splitRatio) / 100)
          : null,
        date: formData.date ? new Date(formData.date).toISOString() : undefined,
        toDiscuss: formData.toDiscuss,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setFormError(data.error ?? "Erreur lors de l'ajout.");
      setFormLoading(false);
      return;
    }

    const newExpense: ExpenseWithAdder = await res.json();
    setSession((prev) => ({ ...prev, expenses: [newExpense, ...prev.expenses] }));
    setFormData({
      label: "",
      amount: "",
      splitRatio: "",
      date: new Date().toISOString().split("T")[0],
      toDiscuss: false,
    });
    setFormLoading(false);
    titleRef.current?.focus();
  }

  async function deleteExpense(expenseId: string) {
    setDeletingId(expenseId);
    const res = await fetch(`/api/sessions/${session.id}/expenses/${expenseId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setSession((prev) => ({
        ...prev,
        expenses: prev.expenses.filter((e) => e.id !== expenseId),
      }));
    }
    setDeletingId(null);
  }

  function startEdit(expense: ExpenseWithAdder) {
    setEditingId(expense.id);
    setEditError("");
    setEditForm({
      label: expense.label,
      amount: String(expense.amount),
      splitRatio: expense.splitRatio != null
        ? String(Math.round((isCreator ? expense.splitRatio : 1 - expense.splitRatio) * 100))
        : "",
      date: new Date(expense.date).toISOString().split("T")[0],
      toDiscuss: expense.toDiscuss,
    });
  }

  async function saveEdit(e: React.FormEvent, expenseId: string) {
    e.preventDefault();
    setEditLoading(true);
    setEditError("");

    const res = await fetch(`/api/sessions/${session.id}/expenses/${expenseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: editForm.label,
        amount: parseFloat(editForm.amount),
        splitRatio: editForm.splitRatio
          ? (isCreator ? parseFloat(editForm.splitRatio) / 100 : 1 - parseFloat(editForm.splitRatio) / 100)
          : null,
        date: editForm.date ? new Date(editForm.date).toISOString() : undefined,
        toDiscuss: editForm.toDiscuss,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setEditError(data.error ?? "Erreur lors de la modification.");
      setEditLoading(false);
      return;
    }

    const updated: ExpenseWithAdder = await res.json();
    setSession((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => (e.id === expenseId ? updated : e)),
    }));
    setEditingId(null);
    setEditLoading(false);
  }

  async function closeSession() {
    setClosingSession(true);
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    });
    if (res.ok) {
      setSession((prev) => ({ ...prev, status: "CLOSED" }));
    }
    setClosingSession(false);
    setConfirmClose(false);
  }

  async function deleteOrLeaveSession() {
    setDeleting(true);
    const res = await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    if (res.ok) {
      router.refresh();
      router.push("/dashboard");
    }
    setDeleting(false);
    setConfirmDelete(false);
  }

  function openSplitEditor() {
    setNewSplitPct(String(myDefaultPct));
    setSplitError("");
    setSplitConfirm(false);
    setEditingSplit(true);
  }

  async function saveSplitRatio() {
    setSplitSaving(true);
    setSplitError("");
    const pct = parseInt(newSplitPct, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setSplitError("Pourcentage invalide (0-100).");
      setSplitSaving(false);
      return;
    }
    // Convert "my share" percentage to creator's ratio
    const creatorRatio = isCreator ? pct / 100 : (100 - pct) / 100;
    const res = await fetch(`/api/sessions/${session.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultSplitRatio: creatorRatio }),
    });
    if (!res.ok) {
      const data = await res.json();
      setSplitError(data.error ?? "Erreur lors de la modification.");
      setSplitSaving(false);
      return;
    }
    const updated = await res.json();
    setSession((prev) => ({ ...prev, defaultSplitRatio: updated.defaultSplitRatio }));
    setEditingSplit(false);
    setSplitConfirm(false);
    setSplitSaving(false);
  }

  async function settleBalance(amount: number, splitRatio: number) {
    setSettling(true);
    const res = await fetch(`/api/sessions/${session.id}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "Remboursement",
        amount,
        splitRatio,
        date: new Date().toISOString(),
      }),
    });
    if (res.ok) {
      const newExpense: ExpenseWithAdder = await res.json();
      setSession((prev) => ({ ...prev, expenses: [newExpense, ...prev.expenses] }));
      setTab("expenses");
    }
    setSettling(false);
  }

  async function toggleDiscuss(expense: ExpenseWithAdder) {
    const next = !expense.toDiscuss;
    const previous = expense.toDiscuss;
    setSession((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) =>
        e.id === expense.id ? { ...e, toDiscuss: next } : e
      ),
    }));
    const res = await fetch(
      `/api/sessions/${session.id}/expenses/${expense.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toDiscuss: next }),
      }
    );
    if (!res.ok) {
      setSession((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) =>
          e.id === expense.id ? { ...e, toDiscuss: previous } : e
        ),
      }));
      return;
    }
    const updated: ExpenseWithAdder = await res.json();
    setSession((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) =>
        e.id === expense.id ? updated : e
      ),
    }));
  }

  const filteredExpenses = session.expenses.filter((e) => {
    if (search.trim() && !e.label.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (discussOnly && !e.toDiscuss) return false;
    return true;
  });

  const discussCount = session.expenses.filter((e) => e.toDiscuss).length;

  const myExpenses = filteredExpenses.filter((e) => e.addedById === currentUserId);
  const partnerExpenses = filteredExpenses.filter((e) => e.addedById !== currentUserId);

  return (
    <div className="min-h-screen dark:bg-zinc-900 pb-safe">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          {/* Left: back + title + badge */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/dashboard"
              className="text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 text-sm shrink-0 p-1 -ml-1"
              aria-label="Retour au dashboard"
            >
              ←
            </Link>
            <span className="text-zinc-300 dark:text-zinc-500 shrink-0">/</span>
            <span className="text-sm font-medium truncate">{session.title}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                session.status === "OPEN"
                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                  : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
              }`}
            >
              {session.status === "OPEN" ? "Active" : "Fermée"}
            </span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle />
            {!session.invitee && (
              <Button variant="outline" size="sm" onClick={copyShareLink}>
                <span className="hidden sm:inline">
                  {copied ? "✓ Copié !" : "🔗 Inviter"}
                </span>
                <span className="sm:hidden" aria-label="Inviter">
                  {copied ? "✓" : "🔗"}
                </span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {/* Partner info */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Partenaire :</span>
            {partner ? (
              <span className="font-medium">{partner.name ?? "Invité"}</span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 dark:text-zinc-300 italic">En attente…</span>
                <Button variant="outline" size="sm" onClick={copyShareLink}>
                  {copied ? "✓ Copié !" : "Copier le lien"}
                </Button>
              </div>
            )}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            {!editingSplit ? (
              <div className="flex items-center gap-2">
                <span>
                  Répartition :{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {session.creator.name ?? "Créateur"} {Math.round(session.defaultSplitRatio * 100)}% /{" "}
                    {session.invitee?.name ?? "Invité"} {Math.round((1 - session.defaultSplitRatio) * 100)}%
                  </span>
                </span>
                {isCreator && session.status === "OPEN" && (
                  <button
                    onClick={openSplitEditor}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    aria-label="Modifier la répartition"
                  >
                    ✏️
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {splitError && (
                  <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950 rounded px-2 py-1">
                    {splitError}
                  </p>
                )}
                {!splitConfirm ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-zinc-500 dark:text-zinc-400">Ma part :</span>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      inputMode="numeric"
                      value={newSplitPct}
                      onChange={(e) => setNewSplitPct(e.target.value)}
                      className="w-20 h-8 text-sm"
                    />
                    <span className="text-zinc-500 dark:text-zinc-400">%</span>
                    <Button variant="outline" size="sm" onClick={() => setEditingSplit(false)}>
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setSplitConfirm(true)}
                      disabled={newSplitPct === String(myDefaultPct)}
                    >
                      Modifier
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                      Êtes-vous sûr de vouloir modifier la répartition par défaut ?
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      Les {session.expenses.filter((e) => e.splitRatio === null).length} dépense(s) utilisant la répartition par défaut seront mises à jour.
                      Les dépenses avec une répartition personnalisée ne seront pas affectées.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSplitConfirm(false)}>
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveSplitRatio}
                        disabled={splitSaving}
                      >
                        {splitSaving ? "Sauvegarde…" : "Confirmer"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Search toggle + "À discuter" filter */}
        {session.expenses.length > 0 && (
          <div className="flex items-center justify-end gap-2 -mt-2">
            <button
              onClick={() => setDiscussOnly((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors shrink-0 ${
                discussOnly
                  ? "bg-amber-500 text-white"
                  : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60"
              }`}
              aria-pressed={discussOnly}
            >
              À discuter{discussCount > 0 ? ` (${discussCount})` : ""}
            </button>
            {showSearch ? (
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Rechercher une dépense…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && closeSearch()}
                    className="pl-9"
                  />
                </div>
                <button
                  onClick={closeSearch}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
                  aria-label="Fermer la recherche"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Rechercher une dépense"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-700">
          {(["expenses", "summary"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              {t === "expenses" ? "Dépenses" : "Résumé"}
            </button>
          ))}
        </div>

        {/* EXPENSES TAB */}
        {tab === "expenses" && (
          <div className="space-y-4">
            {session.status === "OPEN" && (
              <>
                {!showForm ? (
                  <Button onClick={() => setShowForm(true)} className="w-full">
                    + Ajouter une dépense
                  </Button>
                ) : (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Nouvelle dépense</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={addExpense} className="space-y-4">
                        {formError && (
                          <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">
                            {formError}
                          </p>
                        )}
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="label">Titre</Label>
                            <ExpenseLabelInput
                              ref={titleRef}
                              id="label"
                              placeholder="Ex: Restaurant, Courses…"
                              value={formData.label}
                              onChange={(val) => setFormData({ ...formData, label: val })}
                              required
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label htmlFor="amount">Montant</Label>
                              <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                placeholder="0.00"
                                inputMode="decimal"
                                value={formData.amount}
                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                required
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Date</Label>
                              <DatePicker
                                value={formData.date}
                                onChange={(val) => setFormData({ ...formData, date: val })}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="splitRatio">
                              Ma part (
                              {formData.splitRatio
                                ? `${formData.splitRatio}%`
                                : `${myDefaultPct}% par défaut`}
                              )
                            </Label>
                            <Input
                              id="splitRatio"
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max="100"
                              placeholder={`Laisser vide = ${myDefaultPct}%`}
                              value={formData.splitRatio}
                              onChange={(e) => setFormData({ ...formData, splitRatio: e.target.value })}
                            />
                          </div>
                          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
                              checked={formData.toDiscuss}
                              onChange={(e) => setFormData({ ...formData, toDiscuss: e.target.checked })}
                            />
                            <span>À discuter avec l&apos;autre personne</span>
                          </label>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                            Annuler
                          </Button>
                          <Button type="submit" className="flex-1" disabled={formLoading}>
                            {formLoading ? "Ajout…" : "Ajouter"}
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* My expenses */}
            <ExpenseList
              title="Mes dépenses"
              expenses={myExpenses}
              currentUserId={currentUserId}
              isCreator={isCreator}
              defaultSplitRatio={session.defaultSplitRatio}
              formatCurrency={fmt}
              onDelete={deleteExpense}
              deletingId={deletingId}
              canDelete={session.status === "OPEN"}
              canToggleDiscuss={session.status === "OPEN"}
              onToggleDiscuss={toggleDiscuss}
              editingId={editingId}
              editForm={editForm}
              editLoading={editLoading}
              editError={editError}
              onEdit={startEdit}
              onEditChange={(field, value) => setEditForm((prev) => ({ ...prev, [field]: value }))}
              onEditSave={saveEdit}
              onEditCancel={() => setEditingId(null)}
            />

            {/* Partner expenses */}
            {partnerExpenses.length > 0 && (
              <ExpenseList
                title={`Dépenses de ${partner?.name ?? "l'invité"}`}
                expenses={partnerExpenses}
                currentUserId={currentUserId}
                isCreator={isCreator}
                defaultSplitRatio={session.defaultSplitRatio}
                formatCurrency={fmt}
                onDelete={deleteExpense}
                deletingId={deletingId}
                canDelete={false}
                canToggleDiscuss={session.status === "OPEN"}
                onToggleDiscuss={toggleDiscuss}
                editingId={editingId}
                editForm={editForm}
                editLoading={editLoading}
                editError={editError}
                onEdit={startEdit}
                onEditChange={(field, value) => setEditForm((prev) => ({ ...prev, [field]: value }))}
                onEditSave={saveEdit}
                onEditCancel={() => setEditingId(null)}
              />
            )}

            {filteredExpenses.length === 0 && session.expenses.length === 0 && (
              <p className="text-center text-zinc-400 dark:text-zinc-400 py-10">
                Aucune dépense pour le moment.
              </p>
            )}
            {filteredExpenses.length === 0 && session.expenses.length > 0 && (
              <p className="text-center text-zinc-400 dark:text-zinc-400 py-10">
                Aucune dépense ne correspond à votre recherche.
              </p>
            )}
          </div>
        )}

        {/* SUMMARY TAB */}
        {tab === "summary" && (
          <div className="space-y-4">
            <SummaryView
              session={session}
              currentUserId={currentUserId}
              formatCurrency={fmt}
              onSettle={settleBalance}
              settling={settling}
            />

            {/* Close session — creator only, OPEN only, at bottom of summary */}
            {isCreator && session.status === "OPEN" && (
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Fermer la session
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-300 mt-1">
                    Une session fermée ne peut plus recevoir de nouvelles dépenses. Cette action est irréversible.
                  </p>
                </div>
                {!confirmClose ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmClose(true)}
                    className="border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    Fermer la session
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirmClose(false)}>
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={closeSession}
                      disabled={closingSession}
                    >
                      {closingSession ? "Fermeture…" : "Confirmer"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Delete session (creator) / Leave session (invitee) */}
            <div className="border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {isCreator ? "Supprimer la session" : "Quitter la session"}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-300 mt-1">
                  {isCreator
                    ? "Toutes les dépenses associées seront définitivement supprimées. Cette action est irréversible."
                    : "Vous ne ferez plus partie de cette session. Vos dépenses seront conservées."}
                </p>
              </div>
              {!confirmDelete ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  {isCreator ? "Supprimer la session" : "Quitter la session"}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={deleteOrLeaveSession}
                    disabled={deleting}
                  >
                    {deleting
                      ? (isCreator ? "Suppression…" : "Départ…")
                      : "Confirmer"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ExpenseList({
  title,
  expenses,
  currentUserId,
  isCreator,
  defaultSplitRatio,
  formatCurrency,
  onDelete,
  deletingId,
  canDelete,
  canToggleDiscuss,
  onToggleDiscuss,
  editingId,
  editForm,
  editLoading,
  editError,
  onEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
}: {
  title: string;
  expenses: ExpenseWithAdder[];
  currentUserId: string;
  isCreator: boolean;
  defaultSplitRatio: number;
  formatCurrency: (n: number) => string;
  onDelete: (id: string) => void;
  deletingId: string | null;
  canDelete: boolean;
  canToggleDiscuss: boolean;
  onToggleDiscuss: (expense: ExpenseWithAdder) => void;
  editingId: string | null;
  editForm: {
    label: string;
    amount: string;
    splitRatio: string;
    date: string;
    toDiscuss: boolean;
  };
  editLoading: boolean;
  editError: string;
  onEdit: (expense: ExpenseWithAdder) => void;
  onEditChange: (field: string, value: string | boolean) => void;
  onEditSave: (e: React.FormEvent, expenseId: string) => void;
  onEditCancel: () => void;
}) {
  if (expenses.length === 0) return null;

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h3>
        <span className="text-sm font-medium">{formatCurrency(total)}</span>
      </div>
      <div className="space-y-2">
        {expenses.map((expense) => {
          const ratio = expense.splitRatio ?? defaultSplitRatio;
          const myShare = isCreator
            ? expense.amount * ratio
            : expense.amount * (1 - ratio);
          const isEditing = editingId === expense.id;
          const isOwn = expense.addedById === currentUserId;

          if (isEditing) {
            return (
              <Card key={expense.id}>
                <CardContent className="pt-4">
                  <form onSubmit={(e) => onEditSave(e, expense.id)} className="space-y-3">
                    {editError && (
                      <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">
                        {editError}
                      </p>
                    )}
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Titre</Label>
                        <ExpenseLabelInput
                          value={editForm.label}
                          onChange={(val) => onEditChange("label", val)}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label>Montant</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            inputMode="decimal"
                            value={editForm.amount}
                            onChange={(e) => onEditChange("amount", e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Date</Label>
                          <DatePicker
                            value={editForm.date}
                            onChange={(val) => onEditChange("date", val)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Ma part ({editForm.splitRatio ? `${editForm.splitRatio}%` : "défaut"})</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          inputMode="numeric"
                          placeholder="Laisser vide = défaut"
                          value={editForm.splitRatio}
                          onChange={(e) => onEditChange("splitRatio", e.target.value)}
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-zinc-300 text-amber-500 focus:ring-amber-400"
                          checked={editForm.toDiscuss}
                          onChange={(e) => onEditChange("toDiscuss", e.target.checked)}
                        />
                        <span>À discuter avec l&apos;autre personne</span>
                      </label>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onEditCancel}>
                        Annuler
                      </Button>
                      <Button type="submit" size="sm" className="flex-1" disabled={editLoading}>
                        {editLoading ? "Sauvegarde…" : "Sauvegarder"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            );
          }

          return (
            <div
              key={expense.id}
              className={`flex items-center border rounded-xl px-4 py-3 gap-3 ${
                expense.toDiscuss
                  ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
                  : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{expense.label}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-400 mt-0.5">
                  {new Date(expense.date).toLocaleDateString("fr-FR")}
                  {expense.splitRatio !== null && (
                    <span className="ml-2">
                      • ma part {Math.round(myShare / expense.amount * 100)}%
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{formatCurrency(expense.amount)}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-400">
                  ma part : {formatCurrency(myShare)}
                </p>
              </div>
              {/* Toggle "À discuter" — shared marker, both members can flip */}
              {canToggleDiscuss && (
                <button
                  onClick={() => onToggleDiscuss(expense)}
                  className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                    expense.toDiscuss
                      ? "bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-900"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  }`}
                  aria-label={
                    expense.toDiscuss
                      ? "Retirer la marque à discuter"
                      : "Marquer à discuter avec l'autre personne"
                  }
                >
                  {expense.toDiscuss ? "Garder" : "À discuter"}
                </button>
              )}
              {/* Action buttons — proper touch targets */}
              {isOwn && canDelete && (
                <button
                  onClick={() => onEdit(expense)}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shrink-0"
                  aria-label="Modifier"
                >
                  ✏️
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => onDelete(expense.id)}
                  disabled={deletingId === expense.id}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors shrink-0"
                  aria-label="Supprimer"
                >
                  {deletingId === expense.id ? "…" : "✕"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SortKey = "date-desc" | "date-asc" | "amount-desc" | "amount-asc" | "name-asc";
type FilterKey = "all" | "mine" | "partner" | "discuss";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date-desc", label: "Date ↓" },
  { value: "date-asc", label: "Date ↑" },
  { value: "amount-desc", label: "Montant ↓" },
  { value: "amount-asc", label: "Montant ↑" },
  { value: "name-asc", label: "Nom A→Z" },
];

function SummaryView({
  session,
  currentUserId,
  formatCurrency,
  onSettle,
  settling,
}: {
  session: SessionWithRelations;
  currentUserId: string;
  formatCurrency: (n: number) => string;
  onSettle: (amount: number, splitRatio: number) => Promise<void>;
  settling: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("date-desc");

  if (!session.invitee) {
    return (
      <Card className="text-center py-10">
        <CardContent>
          <div className="text-3xl mb-3">⏳</div>
          <CardDescription>
            Le résumé sera disponible une fois que votre partenaire aura rejoint la session.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  if (session.expenses.length === 0) {
    return (
      <Card className="text-center py-10">
        <CardContent>
          <div className="text-3xl mb-3">📊</div>
          <CardDescription>Ajoutez des dépenses pour voir le résumé.</CardDescription>
        </CardContent>
      </Card>
    );
  }

  const isCurrentUserCreator = session.creatorId === currentUserId;
  const currentUser = isCurrentUserCreator ? session.creator : session.invitee;
  const partner = isCurrentUserCreator ? session.invitee : session.creator;

  let creatorPaid = 0;
  let inviteePaid = 0;
  let creatorShouldPay = 0;
  let inviteeShouldPay = 0;

  for (const expense of session.expenses) {
    const ratio = expense.splitRatio ?? session.defaultSplitRatio;
    creatorShouldPay += expense.amount * ratio;
    inviteeShouldPay += expense.amount * (1 - ratio);
    if (expense.addedById === session.creatorId) creatorPaid += expense.amount;
    else inviteePaid += expense.amount;
  }

  const balance = creatorPaid - creatorShouldPay;
  const currentUserPaid = isCurrentUserCreator ? creatorPaid : inviteePaid;
  const currentUserShouldPay = isCurrentUserCreator ? creatorShouldPay : inviteeShouldPay;
  const partnerPaid = isCurrentUserCreator ? inviteePaid : creatorPaid;
  const partnerShouldPay = isCurrentUserCreator ? inviteeShouldPay : creatorShouldPay;
  const currentUserBalance = currentUserPaid - currentUserShouldPay;
  const total = creatorPaid + inviteePaid;

  const settled = Math.abs(balance) < 0.005;
  const currentUserOwes = currentUserBalance < -0.005;

  const filteredExpenses = [...session.expenses]
    .filter((e) => {
      if (filter === "mine") return e.addedById === currentUserId;
      if (filter === "partner") return e.addedById !== currentUserId;
      if (filter === "discuss") return e.toDiscuss;
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case "date-asc": return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "date-desc": return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "amount-desc": return b.amount - a.amount;
        case "amount-asc": return a.amount - b.amount;
        case "name-asc": return a.label.localeCompare(b.label, "fr");
      }
    });

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Toutes" },
    { key: "mine", label: currentUser?.name ?? "Moi" },
    { key: "partner", label: partner?.name ?? "Partenaire" },
    { key: "discuss", label: "À discuter" },
  ];

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <Card
        className={
          settled
            ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950"
            : balance > 0
            ? isCurrentUserCreator
              ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950"
              : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950"
            : isCurrentUserCreator
            ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950"
            : "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950"
        }
      >
        <CardContent className="pt-6 text-center pb-6">
          <div className="text-4xl mb-3">
            {settled ? "🤝" : currentUserBalance > 0.005 ? "💰" : "💸"}
          </div>
          {settled ? (
            <p className="font-semibold text-green-700 dark:text-green-400">
              Vous êtes à l&apos;équilibre !
            </p>
          ) : currentUserBalance > 0.005 ? (
            <>
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                {partner?.name ?? "Votre partenaire"} vous doit
              </p>
              <p className="text-3xl font-bold text-green-700 dark:text-green-400 mt-1">
                {formatCurrency(Math.abs(currentUserBalance))}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Vous devez à {partner?.name ?? "votre partenaire"}
              </p>
              <p className="text-3xl font-bold text-amber-700 dark:text-amber-400 mt-1">
                {formatCurrency(Math.abs(currentUserBalance))}
              </p>
            </>
          )}

          {currentUserOwes && session.status === "OPEN" && (
            <Button
              className="mt-4 w-full sm:w-auto"
              onClick={() =>
                onSettle(Math.abs(currentUserBalance), isCurrentUserCreator ? 0 : 1)
              }
              disabled={settling}
            >
              {settling
                ? "Enregistrement…"
                : `Marquer comme soldé (${formatCurrency(Math.abs(currentUserBalance))})`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Détail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Row label="Total" value={formatCurrency(total)} bold />
            <div className="border-t border-zinc-100 dark:border-zinc-700 my-1" />
            {/* Current user rows */}
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                  {currentUser?.name ?? "Vous"}
                </span>
              </div>
              <Row label="Payé" value={formatCurrency(currentUserPaid)} />
              <Row label="À payer" value={formatCurrency(currentUserShouldPay)} />
            </div>
            {/* Partner rows */}
            <div className="rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-900 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                  {partner?.name ?? "Partenaire"}
                </span>
              </div>
              <Row label="Payé" value={formatCurrency(partnerPaid)} />
              <Row label="À payer" value={formatCurrency(partnerShouldPay)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-expense */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Par dépense</CardTitle>
            {/* Legend */}
            <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
                {currentUser?.name ?? "Vous"}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-violet-400 shrink-0" />
                {partner?.name ?? "Partenaire"}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filters + Sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              {filterOptions.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    filter === key
                      ? key === "mine"
                        ? "bg-blue-500 text-white"
                        : key === "partner"
                        ? "bg-violet-500 text-white"
                        : key === "discuss"
                        ? "bg-amber-500 text-white"
                        : "bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="ml-auto text-xs border border-zinc-200 dark:border-zinc-600 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 cursor-pointer focus:outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Expense rows */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredExpenses.length === 0 && (
              <p className="text-center text-zinc-400 py-6 text-sm">Aucune dépense.</p>
            )}
            {filteredExpenses.map((expense) => {
              const ratio = expense.splitRatio ?? session.defaultSplitRatio;
              const cShare = expense.amount * ratio;
              const iShare = expense.amount * (1 - ratio);
              const myShare = isCurrentUserCreator ? cShare : iShare;
              const partnerShare = isCurrentUserCreator ? iShare : cShare;
              const isMine = expense.addedById === currentUserId;
              return (
                <div
                  key={expense.id}
                  className={`py-3 flex items-start justify-between gap-3 pl-3 border-l-2 ${
                    isMine
                      ? "border-l-blue-400"
                      : "border-l-violet-400"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{expense.label}</p>
                    <p className="text-xs mt-0.5">
                      <span className={`font-medium ${isMine ? "text-blue-500 dark:text-blue-400" : "text-violet-500 dark:text-violet-400"}`}>
                        {expense.addedBy.name ?? "—"}
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-500">
                        {" "}•{" "}{new Date(expense.date).toLocaleDateString("fr-FR")}
                        {expense.splitRatio !== null && (
                          <span> • {Math.round((isCurrentUserCreator ? ratio : 1 - ratio) * 100)}% / {Math.round((isCurrentUserCreator ? 1 - ratio : ratio) * 100)}%</span>
                        )}
                      </span>
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                      {formatCurrency(expense.amount)}
                    </p>
                    <p className="text-xs">
                      <span className="text-blue-500 dark:text-blue-400">{currentUser?.name ?? "Vous"}</span>
                      <span className="text-zinc-400 dark:text-zinc-500"> {formatCurrency(myShare)} </span>
                      <span className="text-zinc-300 dark:text-zinc-600">/</span>
                      <span className="text-violet-500 dark:text-violet-400"> {partner?.name ?? "Partenaire"}</span>
                      <span className="text-zinc-400 dark:text-zinc-500"> {formatCurrency(partnerShare)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-semibold" : ""}`}>
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}
