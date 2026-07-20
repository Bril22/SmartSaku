import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getDebtSummaries } from "@/lib/finance";
import { monthKey, monthLabel, rpShort } from "@/lib/format";
import { DebtCurve } from "@/components/Charts";

export default async function DebtsPage() {
  const userId = await requireUserId();
  const debts = await getDebtSummaries(userId);
  const totalRemaining = debts.reduce((a, d) => a + d.remaining, 0);

  // debt remaining curve from future schedule entries
  const entries = await prisma.debtScheduleEntry.findMany({
    where: { debt: { userId }, month: { gte: monthKey() } },
    orderBy: { month: "asc" },
  });
  const byMonth = new Map<number, number>();
  for (const e of entries) {
    byMonth.set(e.month.getTime(), (byMonth.get(e.month.getTime()) ?? 0) + Number(e.planned));
  }
  const futureSum = [...byMonth.values()].reduce((a, b) => a + b, 0);
  const scale = futureSum > 0 ? totalRemaining / futureSum : 1;
  let running = totalRemaining;
  const curve = [...byMonth.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, planned]) => {
      running = Math.max(0, running - planned * scale);
      return { label: monthLabel(new Date(t)), debt: Math.round(running) };
    });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-4">Debts</h1>

      <div className="bg-card border border-line rounded-lg p-4 mb-4 shadow-soft">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-[11px] uppercase tracking-wide text-inksoft">Total remaining</div>
          <div className="font-extrabold money text-peachdeep">{rpShort(totalRemaining)}</div>
        </div>
        {curve.length > 0 ? (
          <DebtCurve data={curve} />
        ) : (
          <div className="text-sm text-good font-bold py-6 text-center">Lunas! You are debt-free 🎉</div>
        )}
      </div>

      <div className="space-y-2.5">
        {debts.map((d) => {
          const done = d.remaining <= 0;
          return (
            <Link
              key={d.id}
              href={`/debts/${d.id}`}
              className="block bg-card border border-line rounded-md p-3.5 hover:shadow-soft transition"
            >
              <div className="flex justify-between text-[13.5px] font-bold mb-0.5">
                <span>
                  {d.lender} {done && <span className="text-good">✓</span>}
                </span>
                <span className={`money ${done ? "text-good" : ""}`}>
                  {done ? "Lunas!" : rpShort(d.remaining)}
                </span>
              </div>
              <div className="flex justify-between text-[11.5px] text-inksoft mb-2">
                <span>{done ? "fully paid" : `paid ${d.progressPct}%`}</span>
                <span>{!done && d.finishMonth ? `finishes ${monthLabel(d.finishMonth)}` : ""}</span>
              </div>
              <div className="h-2 rounded-full bg-cream overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${d.progressPct}%`, background: done ? "#6E7A4C" : d.color }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
