import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { monthKey, monthLabel } from "@/lib/format";
import { getMoney } from "@/lib/money";
import { adjustDebt, payDebtMonth } from "@/app/actions";
import MoneyInput from "@/components/MoneyInput";

export default async function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const debt = await prisma.debt.findFirst({
    where: { id, userId },
    include: {
      schedule: { orderBy: { month: "asc" } },
      payments: { orderBy: { month: "asc" } },
      adjustments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!debt) notFound();

  const now = monthKey();
  const [accounts, money] = await Promise.all([
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    }),
    getMoney(userId),
  ]);
  const defaultAccount = accounts[0];

  const totalPlanned = debt.schedule.reduce((a, s) => a + Number(s.planned), 0);
  const totalPaid = debt.payments.reduce((a, p) => a + Number(p.amount), 0);
  const adj = debt.adjustments.reduce((a, x) => a + Number(x.delta), 0);
  const remaining = Math.max(0, totalPlanned + adj - totalPaid);
  const payByMonth = new Map(debt.payments.map((p) => [p.month.getTime(), p]));
  const upcoming = debt.schedule.filter((s) => Number(s.planned) > 0);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-1">{debt.lender}</h1>
      <p className="text-sm text-inksoft mb-4">
        Remaining <b className="money text-ink">{money.rp(remaining)}</b>
        {remaining <= 0 && <span className="text-good font-bold"> — Lunas! 🎉</span>}
      </p>

      {/* adjust */}
      <details className="mb-5">
        <summary className="text-xs font-bold text-sagedeep cursor-pointer">
          ⚖️ Adjust balance (debt went up or down)
        </summary>
        <form action={adjustDebt} className="bg-card border border-line rounded-md p-3.5 mt-2 space-y-2">
          <input type="hidden" name="debtId" value={debt.id} />
          <label className="block text-xs text-inksoft">
            Amount in Rp. Positive = debt increased, negative = debt decreased (e.g. -500,000).
          </label>
          <MoneyInput
            name="delta"
            required
            allowNegative
            placeholder="-500,000"
            className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
          />
          <input
            name="reason"
            placeholder="Reason (fee waived, extra interest, ...)"
            className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
          />
          <button className="bg-sagedeep text-cream2 rounded-full text-xs font-extrabold px-4 py-2">
            Apply adjustment
          </button>
        </form>
      </details>

      {/* schedule */}
      <h2 className="text-sm font-bold mb-2">Payment schedule</h2>
      <div className="space-y-1.5 mb-6">
        {upcoming.map((s) => {
          const p = payByMonth.get(s.month.getTime());
          const isPast = s.month < now;
          const isCurrent = s.month.getTime() === now.getTime();
          return (
            <div
              key={s.id}
              className={`bg-card border rounded-md px-3.5 py-2.5 flex items-center gap-3 ${
                isCurrent ? "border-sagedeep" : "border-line"
              }`}
            >
              <div className="flex-1">
                <div className="font-semibold text-[13px]">{monthLabel(s.month)}</div>
                {p && (
                  <div className="text-[11px] text-inksoft">
                    paid {money.rp(Number(p.amount))} on {p.paidDate.toLocaleDateString("id-ID")}
                  </div>
                )}
              </div>
              <div className="font-extrabold money text-[13px]">{money.rpShort(Number(s.planned))}</div>
              {p ? (
                <span className="bg-goodbg text-good rounded-full text-[11px] font-extrabold px-3 py-1.5">
                  {p.status === "PAID" ? "Paid" : p.status.toLowerCase()}
                </span>
              ) : isPast || isCurrent ? (
                <form action={payDebtMonth}>
                  <input type="hidden" name="debtId" value={debt.id} />
                  <input type="hidden" name="month" value={s.month.toISOString()} />
                  <input type="hidden" name="amount" value={Number(s.planned)} />
                  {defaultAccount && <input type="hidden" name="accountId" value={defaultAccount.id} />}
                  <input type="hidden" name="backTo" value={`/debts/${debt.id}`} />
                  <button className="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-3 py-1.5">
                    Pay ✓
                  </button>
                </form>
              ) : (
                <form action={payDebtMonth}>
                  <input type="hidden" name="debtId" value={debt.id} />
                  <input type="hidden" name="month" value={s.month.toISOString()} />
                  <input type="hidden" name="amount" value={Number(s.planned)} />
                  {defaultAccount && <input type="hidden" name="accountId" value={defaultAccount.id} />}
                  <input type="hidden" name="backTo" value={`/debts/${debt.id}`} />
                  <button className="border border-line text-inksoft rounded-full text-[11px] font-bold px-3 py-1.5 hover:border-sagedeep hover:text-sagedeep">
                    Pay early
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {/* adjustments history */}
      {debt.adjustments.length > 0 && (
        <>
          <h2 className="text-sm font-bold mb-2">Adjustment history</h2>
          <div className="space-y-1.5">
            {debt.adjustments.map((a) => (
              <div key={a.id} className="bg-card border border-line rounded-md px-3.5 py-2.5 flex justify-between text-[12.5px]">
                <span className="text-inksoft">
                  {a.createdAt.toLocaleDateString("id-ID")} {a.reason && `· ${a.reason}`}
                </span>
                <span className={`font-extrabold money ${Number(a.delta) < 0 ? "text-good" : "text-bad"}`}>
                  {Number(a.delta) > 0 ? "+" : ""}
                  {money.rpShort(Number(a.delta))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
