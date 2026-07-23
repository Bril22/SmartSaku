/** Debt payoff simulator — pure functions, safe to run on the server or client. */

export type PayoffDebt = {
  id: string;
  lender: string;
  balance: number; // minor units, > 0
  aprPct: number; // annual interest rate, percent
  minPayment: number; // minor units per month
};

export type StrategyResult = {
  months: number;
  totalInterest: number;
  totalPaid: number;
  order: string[]; // debt ids, in the order they get cleared
  neverPaysOff: boolean;
};

export type Strategy = "snowball" | "avalanche";

const MAX_MONTHS = 1200; // 100-year safety net for negative amortisation

export const DEBT_KINDS: Array<{ value: string; label: string; icon: string }> = [
  { value: "bank", label: "Bank loan / KTA", icon: "🏦" },
  { value: "card", label: "Credit card", icon: "💳" },
  { value: "paylater", label: "PayLater", icon: "🛍️" },
  { value: "pinjol", label: "Pinjaman online", icon: "📱" },
  { value: "kpr", label: "Mortgage (KPR)", icon: "🏠" },
  { value: "vehicle", label: "Vehicle (kredit)", icon: "🏍️" },
  { value: "personal", label: "Family / friend", icon: "🤝" },
  { value: "other", label: "Other", icon: "📄" },
];

export function debtKind(value: string) {
  return DEBT_KINDS.find((k) => k.value === value) ?? DEBT_KINDS[DEBT_KINDS.length - 1];
}

/** Total fixed monthly payment a plan uses: every minimum, plus the extra. */
export function monthlyBudget(debts: PayoffDebt[], extraPerMonth: number): number {
  return debts.reduce((a, d) => a + Math.max(0, d.minPayment), 0) + Math.max(0, extraPerMonth);
}

/**
 * Simulate paying every debt off. Each month: interest accrues, minimums are
 * paid, then whatever budget is left is thrown at the target debt (smallest
 * balance for snowball, highest rate for avalanche). Freed-up minimums cascade
 * to the target automatically because the monthly budget is held constant.
 */
export function simulatePayoff(
  debts: PayoffDebt[],
  extraPerMonth: number,
  strategy: Strategy,
): StrategyResult {
  const state = debts
    .filter((d) => d.balance > 0)
    .map((d) => ({
      id: d.id,
      bal: d.balance,
      rate: Math.max(0, d.aprPct) / 100 / 12,
      min: Math.max(0, d.minPayment),
    }));

  const empty: StrategyResult = {
    months: 0,
    totalInterest: 0,
    totalPaid: 0,
    order: [],
    neverPaysOff: false,
  };
  if (!state.length) return empty;

  const budget = state.reduce((a, d) => a + d.min, 0) + Math.max(0, extraPerMonth);
  if (budget <= 0) return { ...empty, neverPaysOff: true };

  let months = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  const order: string[] = [];
  const cleared = new Set<string>();

  while (state.some((d) => d.bal > 0) && months < MAX_MONTHS) {
    months++;

    for (const d of state) {
      if (d.bal <= 0) continue;
      const interest = d.bal * d.rate;
      d.bal += interest;
      totalInterest += interest;
    }

    let left = budget;
    const active = state.filter((d) => d.bal > 0);

    // minimums first
    for (const d of active) {
      const pay = Math.min(d.min, d.bal, left);
      d.bal -= pay;
      left -= pay;
      totalPaid += pay;
    }

    // remaining budget to the strategy's target(s)
    const ordered = [...active].sort((a, b) =>
      strategy === "snowball" ? a.bal - b.bal : b.rate - a.rate || a.bal - b.bal,
    );
    for (const d of ordered) {
      if (left <= 0) break;
      if (d.bal <= 0) continue;
      const pay = Math.min(left, d.bal);
      d.bal -= pay;
      left -= pay;
      totalPaid += pay;
    }

    for (const d of state) {
      if (d.bal <= 0 && !cleared.has(d.id)) {
        cleared.add(d.id);
        order.push(d.id);
      }
    }
  }

  const neverPaysOff = months >= MAX_MONTHS && state.some((d) => d.bal > 0);
  return {
    months,
    totalInterest: Math.round(totalInterest),
    totalPaid: Math.round(totalPaid),
    order,
    neverPaysOff,
  };
}

export type PayoffComparison = {
  totalBalance: number;
  minMonthly: number;
  snowball: StrategyResult;
  avalanche: StrategyResult;
  monthsSaved: number; // vs paying minimums only
  interestSaved: number;
};

/** Compare both strategies at the chosen extra payment, and measure the gain
 * over paying only the minimums. */
export function comparePayoff(debts: PayoffDebt[], extraPerMonth: number): PayoffComparison {
  const active = debts.filter((d) => d.balance > 0);
  const totalBalance = active.reduce((a, d) => a + d.balance, 0);
  const minMonthly = active.reduce((a, d) => a + Math.max(0, d.minPayment), 0);

  const snowball = simulatePayoff(active, extraPerMonth, "snowball");
  const avalanche = simulatePayoff(active, extraPerMonth, "avalanche");
  const baseline = simulatePayoff(active, 0, "avalanche");

  const best = avalanche.months <= snowball.months ? avalanche : snowball;
  const monthsSaved =
    baseline.neverPaysOff || best.neverPaysOff ? 0 : Math.max(0, baseline.months - best.months);
  const interestSaved =
    baseline.neverPaysOff || best.neverPaysOff
      ? 0
      : Math.max(0, baseline.totalInterest - best.totalInterest);

  return { totalBalance, minMonthly, snowball, avalanche, monthsSaved, interestSaved };
}
