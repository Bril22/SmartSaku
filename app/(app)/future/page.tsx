import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getDebtSummaries, projectFuture } from "@/lib/finance";
import { monthKey, monthLabel } from "@/lib/format";
import { getMoney } from "@/lib/money";
import { updateSettings } from "@/app/actions";
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

export default async function FuturePage({
  searchParams,
}: {
  searchParams: Promise<{ years?: string; on?: string }>;
}) {
  const userId = await requireUserId();
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

  const [settings, points, money, debts, goals, accounts, planned] = await Promise.all([
    prisma.settings.findUnique({ where: { userId } }),
    projectFuture(userId, horizonYears),
    getMoney(userId),
    getDebtSummaries(userId),
    prisma.goal.findMany({
      where: { userId },
      include: { contributions: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    }),
    prisma.plannedTransaction.findMany({ where: { userId, active: true } }),
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
            <input
              type="date"
              name="on"
              defaultValue={on ?? ""}
              required
              className="rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
            />
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

      <details className="bg-card border border-line rounded-lg p-4" open>
        <summary className="text-sm font-bold cursor-pointer">Assumptions (income, living, growth)</summary>
        <form action={updateSettings} className="mt-3 space-y-3">
          <Field label="Monthly income (Rp)" name="monthlyIncome" value={Number(settings?.monthlyIncome ?? 0)} money />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rent / month" name="livingRent" value={Number(settings?.livingRent ?? 0)} money />
            <Field label="Food / month" name="livingFood" value={Number(settings?.livingFood ?? 0)} money />
            <Field label="Family / month" name="livingFamily" value={Number(settings?.livingFamily ?? 0)} money />
            <Field label="Other / month" name="livingOther" value={Number(settings?.livingOther ?? 0)} money />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Salary growth %/yr" name="salaryGrowthPct" value={settings?.salaryGrowthPct ?? 5} step="0.5" />
            <Field label="Inflation %/yr" name="inflationPct" value={settings?.inflationPct ?? 3} step="0.5" />
            <Field label="Savings rate %/yr" name="savingsRatePct" value={settings?.savingsRatePct ?? 2} step="0.5" />
          </div>
          <button className="bg-sagedeep text-cream2 rounded-full text-xs font-extrabold px-5 py-2.5">
            Save & recalculate
          </button>
        </form>
      </details>
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
                      <input
                        type="date"
                        name="targetDate"
                        defaultValue={g.targetDate ? g.targetDate.toISOString().slice(0, 10) : ""}
                        className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm"
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
                          placeholder={perMonth ? perMonth.toLocaleString("en-US") : "500,000"}
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
                      {g.contributions.map((c) => (
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
                    </Popover>
                  )}
                </div>
                {g.advice && (
                  <div className="mt-3 bg-goodbg rounded-md p-3 text-[12px] leading-relaxed">
                    <div className="font-bold text-sagedeep mb-1">🌱 Saku-Kun says:</div>
                    {g.advice}
                    <div className="text-[10px] text-inksoft mt-1.5">
                      {g.advisedAt &&
                        g.advisedAt.toLocaleDateString("en-US", { day: "numeric", month: "short" })}{" "}
                      · AI information, not licensed financial advice
                    </div>
                  </div>
                )}
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
                  placeholder="Target, e.g. 20,000,000"
                  className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
                />
              </div>
              <input
                type="date"
                name="targetDate"
                className="rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
              />
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

function Field({
  label,
  name,
  value,
  step,
  money,
}: {
  label: string;
  name: string;
  value: number;
  step?: string;
  money?: boolean;
}) {
  const className = "w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money";
  return (
    <div>
      <label className="block text-[11px] font-semibold text-inksoft mb-1">{label}</label>
      {money ? (
        <MoneyInput name={name} defaultValue={value} className={className} />
      ) : (
        <input name={name} type="number" step={step ?? "1"} defaultValue={value} className={className} />
      )}
    </div>
  );
}
