import { prisma } from "./db";
import { addMonths, monthKey } from "./format";

/** a plan item counts in a month only while it is inside its own window */
export function appliesIn(
  item: { startMonth: Date | null; endMonth: Date | null },
  month: Date,
): boolean {
  const t = month.getTime();
  if (item.startMonth && item.startMonth.getTime() > t) return false;
  if (item.endMonth && item.endMonth.getTime() < t) return false;
  return true;
}

export type DebtSummary = {
  id: string;
  lender: string;
  color: string;
  totalPlanned: number;
  totalPaid: number;
  adjustments: number;
  remaining: number;
  finishMonth: Date | null;
  thisMonthPlanned: number;
  thisMonthPaid: number;
  thisMonthStatus: "PAID" | "PARTIAL" | "SKIPPED" | "DUE" | "NONE";
  progressPct: number;
  aprPct: number;
  minPayment: number;
  kind: string;
};

export async function getDebtSummaries(spaceId: string): Promise<DebtSummary[]> {
  const now = monthKey();
  const [debts, planned, paid, adjusted, thisMonthEntries, thisMonthPayments] = await Promise.all([
    prisma.debt.findMany({ where: { spaceId }, orderBy: { lender: "asc" } }),
    prisma.debtScheduleEntry.groupBy({
      by: ["debtId"],
      where: { debt: { spaceId }, planned: { gt: 0 } },
      _sum: { planned: true },
      _max: { month: true },
    }),
    prisma.debtPayment.groupBy({
      by: ["debtId"],
      where: { debt: { spaceId } },
      _sum: { amount: true },
    }),
    prisma.debtAdjustment.groupBy({
      by: ["debtId"],
      where: { debt: { spaceId } },
      _sum: { delta: true },
    }),
    prisma.debtScheduleEntry.findMany({ where: { debt: { spaceId }, month: now } }),
    prisma.debtPayment.findMany({ where: { debt: { spaceId }, month: now } }),
  ]);

  const plannedBy = new Map(planned.map((p) => [p.debtId, p]));
  const paidBy = new Map(paid.map((p) => [p.debtId, Number(p._sum.amount ?? 0n)]));
  const adjBy = new Map(adjusted.map((a) => [a.debtId, Number(a._sum.delta ?? 0n)]));
  const entryBy = new Map(thisMonthEntries.map((e) => [e.debtId, Number(e.planned)]));
  const paymentSumBy = new Map<string, number>();
  for (const p of thisMonthPayments) {
    paymentSumBy.set(p.debtId, (paymentSumBy.get(p.debtId) ?? 0) + Number(p.amount));
  }

  return debts.map((d) => {
    const totalPlanned = Number(plannedBy.get(d.id)?._sum.planned ?? 0n);
    const totalPaid = paidBy.get(d.id) ?? 0;
    const adjustments = adjBy.get(d.id) ?? 0;
    const remaining = Math.max(0, totalPlanned + adjustments - totalPaid);
    const finishMonth = plannedBy.get(d.id)?._max.month ?? null;
    const thisMonthPlanned = entryBy.get(d.id) ?? 0;
    const thisMonthPaid = paymentSumBy.get(d.id) ?? 0;
    const thisMonthStatus =
      thisMonthPlanned > 0 && thisMonthPaid >= thisMonthPlanned
        ? "PAID"
        : thisMonthPaid > 0
          ? "PARTIAL"
          : thisMonthPlanned > 0
            ? "DUE"
            : "NONE";
    const denom = totalPlanned + adjustments;
    const progressPct = denom > 0 ? Math.min(100, Math.round((totalPaid / denom) * 100)) : 100;
    return {
      id: d.id,
      lender: d.lender,
      color: d.color,
      totalPlanned,
      totalPaid,
      adjustments,
      remaining,
      finishMonth,
      thisMonthPlanned,
      thisMonthPaid,
      thisMonthStatus,
      progressPct,
      aprPct: d.aprPct,
      minPayment: Number(d.minPayment),
      kind: d.kind,
    };
  });
}

export type ProjectionPoint = {
  label: string;
  savings: number;
  debt: number;
  netWorth: number;
};

export type ForecastBasis = {
  income: number;
  expense: number;
  incomeFromPlan: boolean;
  expenseFromPlan: boolean;
  planIncome: number;
  planExpense: number;
  debtThisMonth: number;
};

/** What the forecast is currently built on, so the UI can explain itself. */
export async function getForecastBasis(userId: string, spaceId: string): Promise<ForecastBasis> {
  const [settings, plannedItems, debts] = await Promise.all([
    prisma.settings.findUnique({ where: { userId } }),
    prisma.plannedTransaction.findMany({ where: { spaceId, active: true } }),
    prisma.debt.findMany({ where: { spaceId }, include: { schedule: true, payments: true } }),
  ]);
  const start = monthKey();
  const planIncome = plannedItems
    .filter((p) => p.direction === "IN" && appliesIn(p, start))
    .reduce((a, p) => a + Number(p.amount), 0);
  const planExpense = plannedItems
    .filter((p) => p.direction === "OUT" && appliesIn(p, start))
    .reduce((a, p) => a + Number(p.amount), 0);
  const debtThisMonth = debts.reduce(
    (a, d) =>
      a +
      d.schedule
        .filter((s) => s.month.getTime() === start.getTime())
        .reduce((b, s) => b + Number(s.planned), 0),
    0,
  );
  const incomeOverride = Number(settings?.monthlyIncome ?? 0);
  const expenseOverride = Number(settings?.monthlyExpense ?? 0);
  return {
    income: incomeOverride > 0 ? incomeOverride : planIncome,
    expense: expenseOverride > 0 ? expenseOverride : planExpense,
    incomeFromPlan: incomeOverride <= 0,
    expenseFromPlan: expenseOverride <= 0,
    planIncome,
    planExpense,
    debtThisMonth,
  };
}

/**
 * Long-term projection. Debt payments follow the remaining schedule
 * (future months only, scaled by outstanding adjustments); income grows
 * yearly, living costs inflate yearly, savings earn interest monthly.
 */
export async function projectFuture(userId: string, spaceId: string, years: number): Promise<ProjectionPoint[]> {
  const [settings, accounts, debts, plannedItems] = await Promise.all([
    prisma.settings.findUnique({ where: { userId } }),
    prisma.finAccount.findMany({ where: { spaceId, hidden: false } }),
    prisma.debt.findMany({ where: { spaceId }, include: { schedule: true, payments: true, adjustments: true } }),
    prisma.plannedTransaction.findMany({ where: { spaceId, active: true } }),
  ]);
  const planFor = (month: Date, direction: "IN" | "OUT") =>
    plannedItems
      .filter((p) => p.direction === direction && appliesIn(p, month))
      .reduce((a, p) => a + Number(p.amount), 0);
  // a filled-in assumption overrides the plan; clearing it (0) falls back to the plan
  const incomeOverride = Number(settings?.monthlyIncome ?? 0);
  const expenseOverride = Number(settings?.monthlyExpense ?? 0);
  const growth = (settings?.salaryGrowthPct ?? 0) / 100;
  const inflation = (settings?.inflationPct ?? 0) / 100;
  const savingsRateMonthly = (settings?.savingsRatePct ?? 0) / 100 / 12;

  let savings = accounts.reduce((a, x) => a + Number(x.balance), 0);
  const start = monthKey();
  const months = years * 12;

  // planned items already recorded this month are in the balances — don't count them twice
  const startNext = addMonths(start, 1);
  const recordedThisMonth = await prisma.transaction.findMany({
    where: { spaceId, plannedId: { not: null }, date: { gte: start, lt: startNext } },
  });
  const recordedIn = recordedThisMonth
    .filter((t) => t.direction === "IN")
    .reduce((a, t) => a + Number(t.amount), 0);
  const recordedOut = recordedThisMonth
    .filter((t) => t.direction === "OUT")
    .reduce((a, t) => a + Number(t.amount), 0);

  // future planned payment per month key, plus remaining totals for scaling
  const points: ProjectionPoint[] = [];
  type DebtState = { remaining: number; byMonth: Map<number, number> };
  const debtStates: DebtState[] = debts.map((d) => {
    const totalPlanned = d.schedule.reduce((a, s) => a + Number(s.planned), 0);
    const totalPaid = d.payments.reduce((a, p) => a + Number(p.amount), 0);
    const adj = d.adjustments.reduce((a, x) => a + Number(x.delta), 0);
    const remaining = Math.max(0, totalPlanned + adj - totalPaid);
    const byMonth = new Map<number, number>();
    for (const s of d.schedule) {
      if (s.month >= start) byMonth.set(s.month.getTime(), Number(s.planned));
    }
    // scale future schedule so it sums to actual remaining
    const futureSum = [...byMonth.values()].reduce((a, b) => a + b, 0);
    if (futureSum > 0 && remaining !== futureSum) {
      const f = remaining / futureSum;
      for (const [k, v] of byMonth) byMonth.set(k, v * f);
    }
    return { remaining, byMonth };
  });

  for (let i = 0; i < months; i++) {
    const m = addMonths(start, i);
    const yearIdx = Math.floor(i / 12);
    const baseIncome = incomeOverride > 0 ? incomeOverride : planFor(m, "IN");
    const baseLiving = expenseOverride > 0 ? expenseOverride : planFor(m, "OUT");
    let income = baseIncome * Math.pow(1 + growth, yearIdx);
    let living = baseLiving * Math.pow(1 + inflation, yearIdx);
    if (i === 0) {
      income = Math.max(0, income - recordedIn);
      living = Math.max(0, living - recordedOut);
    }
    let debtPay = 0;
    let debtRemaining = 0;
    for (const ds of debtStates) {
      const pay = Math.min(ds.byMonth.get(m.getTime()) ?? 0, ds.remaining);
      ds.remaining -= pay;
      debtPay += pay;
      debtRemaining += ds.remaining;
    }
    savings = savings * (1 + savingsRateMonthly) + income - living - debtPay;
    points.push({
      label:
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m.getUTCMonth()] +
        " " +
        m.getUTCFullYear(),
      savings: Math.round(savings),
      debt: Math.round(debtRemaining),
      netWorth: Math.round(savings - debtRemaining),
    });
  }
  return points;
}
