import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getDebtSummaries, projectFuture } from "@/lib/finance";
import { getMoney } from "@/lib/money";
import { updateSettings } from "@/app/actions";
import { FutureChart } from "@/components/Charts";

export default async function FuturePage({
  searchParams,
}: {
  searchParams: Promise<{ years?: string }>;
}) {
  const userId = await requireUserId();
  const { years: yearsParam } = await searchParams;
  const years = yearsParam === "10" ? 10 : 5;

  const [settings, points, money, debts] = await Promise.all([
    prisma.settings.findUnique({ where: { userId } }),
    projectFuture(userId, years),
    getMoney(userId),
    getDebtSummaries(userId),
  ]);

  const debtFreePoint = points.find((p) => p.debt <= 0);
  const last = points[points.length - 1];
  const lowest = points.reduce((a, p) => (p.savings < a.savings ? p : a), points[0]);
  const netWorth = points[0] ? points[0].netWorth : 0;
  const monthlyDebtPay = debts.reduce((a, d) => a + d.thisMonthPlanned, 0);
  const income = Number(settings?.monthlyIncome ?? 0n);
  const debtRatio = income > 0 ? Math.round((monthlyDebtPay / income) * 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Future</h1>
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
        <FutureChart data={points} code={money.code} ratePerIdr={money.ratePerIdr} symbol={money.symbol} />
      </div>

      <details className="bg-card border border-line rounded-lg p-4" open>
        <summary className="text-sm font-bold cursor-pointer">Assumptions (income, living, growth)</summary>
        <form action={updateSettings} className="mt-3 space-y-3">
          <Field label="Monthly income (Rp)" name="monthlyIncome" value={Number(settings?.monthlyIncome ?? 0)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rent / month" name="livingRent" value={Number(settings?.livingRent ?? 0)} />
            <Field label="Food / month" name="livingFood" value={Number(settings?.livingFood ?? 0)} />
            <Field label="Family / month" name="livingFamily" value={Number(settings?.livingFamily ?? 0)} />
            <Field label="Other / month" name="livingOther" value={Number(settings?.livingOther ?? 0)} />
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
    </div>
  );
}

function Field({
  label,
  name,
  value,
  step,
}: {
  label: string;
  name: string;
  value: number;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-inksoft mb-1">{label}</label>
      <input
        name={name}
        type="number"
        step={step ?? "1"}
        defaultValue={value}
        className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
      />
    </div>
  );
}
