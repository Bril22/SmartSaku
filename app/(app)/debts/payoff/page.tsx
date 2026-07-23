import Link from "next/link";
import { requireSpace } from "@/lib/space";
import { getMoney } from "@/lib/money";
import { getDebtSummaries } from "@/lib/finance";
import { monthKey } from "@/lib/format";
import { type PayoffDebt } from "@/lib/payoff";
import PayoffPlanner from "@/components/PayoffPlanner";

export default async function PayoffPage() {
  const { userId, spaceId } = await requireSpace();
  const [money, summaries] = await Promise.all([getMoney(userId), getDebtSummaries(spaceId)]);

  const debts: PayoffDebt[] = summaries
    .filter((d) => d.remaining > 0)
    .map((d) => ({
      id: d.id,
      lender: d.lender,
      balance: d.remaining,
      aprPct: d.aprPct,
      // fall back to the scheduled amount, then a small floor, so a plan still runs
      minPayment:
        d.minPayment > 0
          ? d.minPayment
          : d.thisMonthPlanned > 0
            ? d.thisMonthPlanned
            : Math.max(1, Math.round(d.remaining * 0.01)),
    }));

  return (
    <div className="max-w-2xl">
      <Link href="/money?tab=debts" className="text-xs font-bold text-sagedeep">
        ‹ Debts
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-1">Payoff planner</h1>
      <p className="text-[12.5px] text-inksoft mb-5">
        See how snowball and avalanche compare, and what paying a little extra does. Set each
        debt’s rate and minimum on its page for the sharpest numbers.
      </p>

      {debts.length === 0 ? (
        <div className="bg-goodbg text-good rounded-lg px-4 py-6 text-center font-semibold">
          No debts to plan — you’re clear! 🎉
        </div>
      ) : (
        <PayoffPlanner
          debts={debts}
          symbol={money.symbol}
          ratePerIdr={money.ratePerIdr}
          startMonthOffset={monthKey().getTime()}
        />
      )}
    </div>
  );
}
