import type { Expense, ExpenseSession, User } from "@prisma/client";

type ExpenseWithAdder = Expense & { addedBy: Pick<User, "id" | "name"> };

type SessionWithRelations = ExpenseSession & {
  creator: Pick<User, "id" | "name">;
  invitee: Pick<User, "id" | "name"> | null;
  expenses: ExpenseWithAdder[];
};

export type ExpenseBreakdown = {
  expense: ExpenseWithAdder;
  creatorShare: number;
  inviteeShare: number;
  effectiveSplitRatio: number;
};

export type SessionSummary = {
  creatorPaid: number;
  inviteePaid: number;
  creatorShouldPay: number;
  inviteeShouldPay: number;
  balance: number; // positive = invitee owes creator; negative = creator owes invitee
  breakdown: ExpenseBreakdown[];
};

export function calculateSessionSummary(
  session: SessionWithRelations
): SessionSummary | null {
  if (!session.invitee) return null;

  // Private expenses are personal and never count toward the shared balance.
  const sharedExpenses = session.expenses.filter((expense) => expense.isShared);

  const breakdown: ExpenseBreakdown[] = sharedExpenses.map((expense) => {
    const effectiveSplitRatio =
      expense.splitRatio ?? session.defaultSplitRatio;
    const creatorShare = expense.amount * effectiveSplitRatio;
    const inviteeShare = expense.amount * (1 - effectiveSplitRatio);
    return { expense, creatorShare, inviteeShare, effectiveSplitRatio };
  });

  const creatorPaid = sharedExpenses
    .filter((e) => e.addedById === session.creatorId)
    .reduce((sum, e) => sum + e.amount, 0);

  const inviteePaid = sharedExpenses
    .filter((e) => e.addedById === session.inviteeId)
    .reduce((sum, e) => sum + e.amount, 0);

  const creatorShouldPay = breakdown.reduce(
    (sum, b) => sum + b.creatorShare,
    0
  );
  const inviteeShouldPay = breakdown.reduce(
    (sum, b) => sum + b.inviteeShare,
    0
  );

  // balance > 0 → invitee owes creator
  // balance < 0 → creator owes invitee
  const balance = creatorPaid - creatorShouldPay;

  return {
    creatorPaid,
    inviteePaid,
    creatorShouldPay,
    inviteeShouldPay,
    balance,
    breakdown,
  };
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}
