import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getDebtSummaries, getForecastBasis, projectFuture } from "@/lib/finance";
import { formatMinor, monthKey, monthLabel } from "@/lib/format";
import { getMoney } from "@/lib/money";
import { clearAssumptions, updateSettings } from "@/app/actions";
import {
  addGoal,
  askGoalAdvice,
  contributeGoal,
  deleteGoal,
  deleteGoalContribution,
  updateGoal,
} from "@/app/goals/actions";
import { FutureChart } from "@/components/Charts";
import MoneyInput from "@/components/MoneyInput";
import Popover from "@/components/Popover";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";
import DateField from "@/components/DateField";
import GoalChat from "@/components/GoalChat";

export default async function FuturePage({
  searchParams,
}: {
  searchParams: Promise<{ years?: string; on?: string }>;
}) {
  const { userId, spaceId } = await requireSpace();
  const { years: yearsParam, on } = await searchParams;
  const years = yearsParam === "10" ? 10 : 5;

  const now = monthKey();
  let lookupDate: Date | null = null;
  let lookupMonths = 0;
  if (on && /^\d{4}-\d{2}-\d{2}$/.test(on)) {
    const d = new Date(on + "T00:00:00Z");
    lookupMonths =
      (d.getUTCFullYear() - now.getUTCFullYear()) * 12 + (d.getUTCMonth() - now.getUTCMonth());
    if (lookupMonths >= 0 && lookupMonths <= 360) lookupDate = d;
  }
  const horizonYears = Math.max(years, Math.ceil((lookupMonths + 1) / 12));

  const [settings, points, money, debts, goals, accounts, planned, basis] = await Promise.all([
    prisma.settings.findUnique({ where: { userId } }),
    projectFuture(userId, spaceId, horizonYears),
    getMoney(userId),
    getDebtSummaries(spaceId),
    prisma.goal.findMany({
      where: { spaceId },
      include: {
        contributions: { orderBy: { createdAt: "desc" } },
        messages: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.finAccount.findMany({
      where: { spaceId, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.plannedTransaction.findMany({ where: { spaceId, active: true } }),
    getForecastBasis(userId, spaceId),
  ]);
  const chartPoints = points.slice(0, years * 12);
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name, icon: "🏦" }));
  const goalReserved = goals.reduce(
    (a, g) => a + g.contributions.reduce((s, c) => s + Number(c.amount), 0),
    0,
  );

  const debtFreePoint = chartPoints.find((p) => p.debt <= 0);
  const last = chartPoints[chartPoints.length - 1];
  const lowest = chartPoints.reduce((a, p) => (p.savings < a.savings ? p : a), chartPoints[0]);
  const netWorth = (chartPoints[0] ? chartPoints[0].netWorth : 0) + goalReserved;
  const monthlyDebtPay = debts.reduce((a, d) => a + d.thisMonthPlanned, 0);
  const plannedIn = planned
    .filter((p) => p.direction === "IN")
    .reduce((a, p) => a + Number(p.amount), 0);
  const income = plannedIn || Number(settings?.monthlyIncome ?? 0n);
  const debtRatio = income > 0 ? Math.round((monthlyDebtPay / income) * 100) : 0;

  const lookupPoint = lookupDate ? points[Math.min(lookupMonths, points.length - 1)] : null;
  const lookupLabel = lookupDate
    ? lookupDate.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const lookupDebtRatio =
    lookupPoint && income > 0
      ? Math.max(0, Math.round(((lookupPoint.debt > 0 ? monthlyDebtPay : 0) / income) * 100))
      : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Forecast</h1>
        <div className="flex gap-1 bg-card border border-line rounded-full p-1">
          <Link
            href="/future?years=5"
            className={`px-4 py-1.5 rounded-full text-xs font-extrabold ${years === 5 ? "bg-sagedeep text-cream2" : "text-inksoft"}`}
          >
            5 yr
          </Link>
          <Link
            href="/future?years=10"
            className={`px-4 py-1.5 rounded-full text-xs font-extrabold ${years === 10 ? "bg-sagedeep text-cream2" : "text-inksoft"}`}
          >
            10 yr
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-2.5">
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Net worth today</div>
          <div className={`font-display font-bold text-lg money mt-0.5 ${netWorth < 0 ? "text-bad" : "text-sagedeep"}`}>
            {money.rp(netWorth)}
          </div>
        </div>
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Debt ratio (this month)</div>
          <div className={`font-display font-bold text-lg money mt-0.5 ${debtRatio > 40 ? "text-bad" : ""}`}>
            {debtRatio}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Debt-free</div>
          <div className="font-extrabold text-[13px] mt-1">{debtFreePoint ? debtFreePoint.label : "beyond " + years + "y"}</div>
        </div>
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Savings in {years}y</div>
          <div className="font-extrabold text-[13px] money mt-1 text-sagedeep">{money.rpShort(last?.savings ?? 0)}</div>
        </div>
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Lowest point</div>
          <div className={`font-extrabold text-[13px] money mt-1 ${lowest && lowest.savings < 0 ? "text-bad" : ""}`}>
            {money.rpShort(lowest?.savings ?? 0)}
          </div>
        </div>
      </div>

      {/* exact-date lookup */}
      <div className="bg-card border border-line rounded-lg p-4 mb-4">
        <form method="GET" action="/future" className="flex items-end gap-2.5 flex-wrap">
          <input type="hidden" name="years" value={years} />
          <div>
            <label className="block text-[11px] font-semibold text-inksoft mb-1">
              🔮 Check a specific date
            </label>
            <DateField name="on" defaultValue={on ?? ""} required title="Check a specific date" />
          </div>
          <button className="bg-sagedeep text-cream2 rounded-full text-xs font-extrabold px-5 py-2.5">
            Look ahead
          </button>
        </form>
        {lookupPoint && (
          <div className="mt-3">
            <div className="text-[12.5px] font-bold mb-2">On {lookupLabel}:</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-cream2 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wide text-inksoft">Savings</div>
                <div className={`font-extrabold money text-[13.5px] mt-0.5 ${lookupPoint.savings < 0 ? "text-bad" : "text-sagedeep"}`}>
                  {money.rp(lookupPoint.savings)}
                </div>
              </div>
              <div className="bg-cream2 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wide text-inksoft">Debt left</div>
                <div className="font-extrabold money text-[13.5px] mt-0.5 text-peachdeep">
                  {lookupPoint.debt <= 0 ? "Lunas! 🎉" : money.rp(lookupPoint.debt)}
                </div>
              </div>
              <div className="bg-cream2 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wide text-inksoft">Net worth</div>
                <div className={`font-extrabold money text-[13.5px] mt-0.5 ${lookupPoint.netWorth < 0 ? "text-bad" : ""}`}>
                  {money.rp(lookupPoint.netWorth + goalReserved)}
                </div>
              </div>
              <div className="bg-cream2 rounded-md p-3">
                <div className="text-[10px] uppercase tracking-wide text-inksoft">Debt ratio</div>
                <div className="font-extrabold money text-[13.5px] mt-0.5">{lookupDebtRatio}%</div>
              </div>
            </div>
            <p className="text-[10.5px] text-inksoft mt-2">
              {lookupMonths} month{lookupMonths === 1 ? "" : "s"} from now, using your current plan
              and assumptions. Goal savings of {money.rpShort(goalReserved)} are included in net
              worth.
            </p>
          </div>
        )}
        {on && !lookupPoint && (
          <p className="text-[11.5px] text-bad mt-2">
            Pick a date between today and 30 years from now.
          </p>
        )}
      </div>

      {lowest && lowest.savings < 0 && (
        <div className="bg-badbg text-bad rounded-md px-4 py-3 text-sm font-semibold mb-4">
          ⚠ Your savings go negative around {lowest.label}. Income or living costs need adjusting.
        </div>
      )}

      <div className="md:grid md:grid-cols-[3fr_2fr] md:gap-6 md:items-start">
      <div className="bg-card border border-line rounded-lg p-4 mb-5 md:mb-0 shadow-soft">
        <div className="text-[11px] uppercase tracking-wide text-inksoft mb-2">
          Savings vs debt — next {years} years
        </div>
        <FutureChart data={chartPoints} code={money.code} ratePerIdr={money.ratePerIdr} symbol={money.symbol} />
      </div>

      <div className="bg-card border border-line rounded-lg p-4">
        <h2 className="text-sm font-bold">Assumptions</h2>
        <p className="text-[11.5px] text-inksoft mt-1 mb-3 leading-relaxed">
          Fill a field to tell the forecast what to use. Leave it empty to follow your plan and
          debts instead.
        </p>

        <div className="rounded-md bg-cream2 border border-line p-3 mb-3 space-y-1.5">
          <BasisRow
            label="Income / month"
            amount={basis.income}
            fromPlan={basis.incomeFromPlan}
            money={money}
          />
          <BasisRow
            label="Expenses / month"
            amount={basis.expense}
            fromPlan={basis.expenseFromPlan}
            money={money}
          />
          {basis.debtThisMonth > 0 && (
            <div className="flex items-baseline gap-2 text-[12px]">
              <span className="flex-1 text-inksoft">Debt / month</span>
              <span className="font-bold money">{money.rp(basis.debtThisMonth)}</span>
              <span className="text-[10px] font-bold text-sagedeep bg-goodbg rounded-full px-2 py-0.5">
                schedule
              </span>
            </div>
          )}
        </div>

        <form action={updateSettings} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Monthly income"
              name="monthlyIncome"
              value={Number(settings?.monthlyIncome ?? 0)}
              hint={basis.incomeFromPlan ? `Plan: ${money.rpShort(basis.planIncome)}` : undefined}
              money
            />
            <Field
              label="Monthly expense"
              name="monthlyExpense"
              value={Number(settings?.monthlyExpense ?? 0)}
              hint={basis.expenseFromPlan ? `Plan: ${money.rpShort(basis.planExpense)}` : undefined}
              money
            />
          </div>
          <div className="grid grid-cols-3 gap-2.5 items-end">
            <Field label="Salary growth" name="salaryGrowthPct" value={settings?.salaryGrowthPct ?? 5} step="0.5" suffix="%/yr" />
            <Field label="Inflation" name="inflationPct" value={settings?.inflationPct ?? 3} step="0.5" suffix="%/yr" />
            <Field label="Savings rate" name="savingsRatePct" value={settings?.savingsRatePct ?? 2} step="0.5" suffix="%/yr" />
          </div>
          <SubmitButton
            className="w-full sm:w-auto rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
            pendingText="Recalculating…"
          >
            Save &amp; recalculate
          </SubmitButton>
        </form>

        {(!basis.incomeFromPlan || !basis.expenseFromPlan) && (
          <form action={clearAssumptions} className="mt-2.5 pt-2.5 border-t border-line">
            <SubmitButton
              className="text-[11.5px] font-extrabold text-inksoft"
              pendingText="Clearing…"
            >
              Clear and follow my plan instead
            </SubmitButton>
          </form>
        )}
      </div>
      </div>

      {/* goals */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-bold">
            🎯 Goals{goalReserved > 0 && ` · ${money.rpShort(goalReserved)} saved`}
          </h2>
        </div>
        <div className="grid gap-2.5 md:grid-cols-2">
          {goals.map((g) => {
            const saved = g.contributions.reduce((a, c) => a + Number(c.amount), 0);
            const target = Number(g.targetAmount);
            const pct = Math.min(100, Math.round((saved / target) * 100));
            const reached = saved >= target;
            const monthsLeft = g.targetDate
              ? Math.max(
                  0,
                  (g.targetDate.getUTCFullYear() - now.getUTCFullYear()) * 12 +
                    (g.targetDate.getUTCMonth() - now.getUTCMonth()),
                )
              : null;
            const perMonth =
              !reached && monthsLeft && monthsLeft > 0
                ? Math.ceil((target - saved) / monthsLeft)
                : null;
            return (
              <div key={g.id} className="bg-card border border-line rounded-lg p-4">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-xl">{g.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14px] truncate">
                      {g.name} {reached && <span className="text-good">🎉</span>}
                    </div>
                    <div className="text-[11px] text-inksoft">
                      {money.rpShort(saved)} of {money.rpShort(target)}
                      {g.targetDate && ` · by ${monthLabel(g.targetDate)}`}
                    </div>
                  </div>
                  <Popover trigger="✎" triggerClass="text-inksoft px-1" width="w-64">
                    <form action={updateGoal} className="space-y-2">
                      <input type="hidden" name="id" value={g.id} />
                      <div className="flex gap-2">
                        <input
                          name="icon"
                          defaultValue={g.icon}
                          maxLength={8}
                          className="w-12 text-center text-lg bg-cream2 rounded-md border border-line py-1.5"
                        />
                        <input
                          name="name"
                          defaultValue={g.name}
                          required
                          maxLength={40}
                          className="flex-1 min-w-0 rounded-md border border-line bg-cream2 px-3 py-2 text-sm"
                        />
                      </div>
                      <MoneyInput
                        name="targetAmount"
                        required
                        defaultValue={target}
                        className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right money"
                      />
                      <DateField
                        name="targetDate"
                        defaultValue={g.targetDate ? g.targetDate.toISOString().slice(0, 10) : ""}
                        placeholder="Target date (optional)"
                        title="Target date"
                      />
                      <button className="w-full bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-2">
                        Save goal
                      </button>
                    </form>
                    <form action={deleteGoal}>
                      <input type="hidden" name="id" value={g.id} />
                      <button className="w-full border border-bad text-bad rounded-full text-[11px] font-extrabold py-2">
                        Delete goal (money returns to accounts)
                      </button>
                    </form>
                  </Popover>
                </div>
                <div className="h-2.5 rounded-full bg-cream overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: reached ? "#31694E" : "#BBC863" }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-inksoft mb-2.5">
                  <span>{pct}%</span>
                  {perMonth && <span>needs ~{money.rpShort(perMonth)}/month</span>}
                  {reached && <span className="text-good font-bold">Target reached!</span>}
                </div>
                <div className="flex gap-2">
                  {!reached && (
                    <Popover
                      trigger="+ Save money"
                      triggerClass="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-3.5 py-2"
                      width="w-64"
                    >
                      <form action={contributeGoal} className="space-y-2">
                        <input type="hidden" name="id" value={g.id} />
                        <label className="block text-[10.5px] font-bold text-inksoft">Amount</label>
                        <MoneyInput
                          name="amount"
                          required
                          placeholder={perMonth ? formatMinor(perMonth) : "500.000,00"}
                          className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right money"
                        />
                        <label className="block text-[10.5px] font-bold text-inksoft">From account</label>
                        <Select
                          name="accountId"
                          required
                          defaultValue={accountOptions[0]?.value}
                          options={accountOptions}
                        />
                        <SubmitButton
                          className="w-full bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-2"
                          pendingText="Saving…"
                        >
                          Save to goal
                        </SubmitButton>
                      </form>
                    </Popover>
                  )}
                  <form action={askGoalAdvice}>
                    <input type="hidden" name="id" value={g.id} />
                    <SubmitButton
                      className="border border-sagedeep text-sagedeep rounded-full text-[11px] font-extrabold px-3.5 py-2"
                      pendingText="Saku-Kun is thinking…"
                    >
                      🌱 Ask Saku AI
                    </SubmitButton>
                  </form>
                  {g.contributions.length > 0 && (
                    <Popover
                      trigger={`${g.contributions.length} deposit${g.contributions.length === 1 ? "" : "s"} ▾`}
                      triggerClass="text-inksoft text-[11px] font-bold px-1 py-2"
                      width="w-60"
                    >
                      {g.contributions.slice(0, 5).map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-[12px] border-t border-line pt-2 first:border-0 first:pt-0">
                          <span className="flex-1">
                            {c.createdAt.toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                          </span>
                          <b className="money">{money.rpShort(Number(c.amount))}</b>
                          <form action={deleteGoalContribution}>
                            <input type="hidden" name="id" value={c.id} />
                            <button className="text-bad font-extrabold px-1" title="Undo — money returns to account">
                              ✕
                            </button>
                          </form>
                        </div>
                      ))}
                      {g.contributions.length > 5 && (
                        <p className="text-[10.5px] text-inksoft pt-2 border-t border-line">
                          Showing the 5 most recent of {g.contributions.length} deposits.
                        </p>
                      )}
                    </Popover>
                  )}
                </div>
                <GoalChat
                  goalId={g.id}
                  messages={g.messages.map((m) => ({
                    id: m.id,
                    role: m.role,
                    text: m.text,
                    at: m.createdAt.toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                    }),
                  }))}
                />
              </div>
            );
          })}
        </div>

        <details className="mt-3 max-w-md">
          <summary className="text-xs font-bold text-sagedeep cursor-pointer">+ New goal</summary>
          <form action={addGoal} className="bg-card border border-line rounded-md p-3.5 mt-2 space-y-2">
            <div className="flex gap-2">
              <input
                name="icon"
                placeholder="🎯"
                maxLength={8}
                className="w-12 text-center text-lg bg-cream2 rounded-md border border-line py-2"
              />
              <input
                name="name"
                required
                maxLength={40}
                placeholder="Holiday to Japan, new laptop, …"
                className="flex-1 min-w-0 rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <MoneyInput
                  name="targetAmount"
                  required
                  placeholder="Target, e.g. 20.000.000,00"
                  className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
                />
              </div>
              <div className="w-44 shrink-0">
                <DateField name="targetDate" placeholder="Target date" title="Target date" />
              </div>
            </div>
            <SubmitButton
              className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
              pendingText="Creating…"
            >
              Create goal
            </SubmitButton>
          </form>
        </details>
      </section>
    </div>
  );
}

function BasisRow({
  label,
  amount,
  fromPlan,
  money,
}: {
  label: string;
  amount: number;
  fromPlan: boolean;
  money: { rp: (n: number) => string };
}) {
  return (
    <div className="flex items-baseline gap-2 text-[12px]">
      <span className="flex-1 text-inksoft">{label}</span>
      <span className="font-bold money">{money.rp(amount)}</span>
      <span
        className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
          fromPlan ? "text-sagedeep bg-goodbg" : "text-earth bg-warnbg"
        }`}
      >
        {fromPlan ? "plan" : "yours"}
      </span>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  step,
  money,
  hint,
  suffix,
}: {
  label: string;
  name: string;
  value: number;
  step?: string;
  money?: boolean;
  hint?: string;
  suffix?: string;
}) {
  const className = "w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money";
  return (
    <div className="min-w-0 flex flex-col justify-end">
      <label className="block text-[11px] font-semibold text-inksoft mb-1 leading-tight">
        {label}
        {suffix && <span className="text-inksoft/70"> {suffix}</span>}
      </label>
      {money ? (
        <MoneyInput
          key={`${name}-${value}`}
          name={name}
          defaultValue={value || undefined}
          placeholder="—"
          className={className}
        />
      ) : (
        <input key={`${name}-${value}`} name={name} type="number" step={step ?? "1"} defaultValue={value} className={className} />
      )}
      {hint && <div className="text-[10px] text-inksoft mt-1 truncate">{hint}</div>}
    </div>
  );
}
