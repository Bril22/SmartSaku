import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { monthKey, monthLabel } from "@/lib/format";
import { getMoney } from "@/lib/money";
import {
  addScheduleEntry,
  adjustDebt,
  deleteDebt,
  deleteDebtAdjustment,
  deleteDebtPayment,
  deleteScheduleEntry,
  renameDebt,
  updateDebtPayment,
  updateScheduleEntry,
} from "@/app/actions";
import MoneyInput from "@/components/MoneyInput";
import PayForm from "@/components/PayForm";
import Popover from "@/components/Popover";
import DateField from "@/components/DateField";

export default async function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId, spaceId } = await requireSpace();
  const { id } = await params;
  const debt = await prisma.debt.findFirst({
    where: { id, spaceId },
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
      where: { spaceId, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getMoney(userId),
  ]);

  const totalPlanned = debt.schedule.reduce((a, s) => a + Number(s.planned), 0);
  const totalPaid = debt.payments.reduce((a, p) => a + Number(p.amount), 0);
  const adj = debt.adjustments.reduce((a, x) => a + Number(x.delta), 0);
  const remaining = Math.max(0, totalPlanned + adj - totalPaid);
  const payByMonth = new Map<number, typeof debt.payments>();
  for (const p of debt.payments) {
    const key = p.month.getTime();
    if (!payByMonth.has(key)) payByMonth.set(key, []);
    payByMonth.get(key)!.push(p);
  }
  const upcoming = debt.schedule.filter((s) => Number(s.planned) > 0);
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name, icon: "🏦" }));

  return (
    <div>
      <Link href="/money?tab=debts" className="text-xs font-bold text-sagedeep">
        ‹ Debts
      </Link>
      <form action={renameDebt} className="flex items-center gap-2 mt-1 mb-1">
        <input type="hidden" name="debtId" value={debt.id} />
        <input
          name="lender"
          defaultValue={debt.lender}
          maxLength={40}
          className="font-display text-2xl font-semibold bg-transparent border-b border-transparent focus:border-line focus:outline-none flex-1 min-w-0"
        />
        <button className="text-[11px] font-extrabold text-sagedeep shrink-0">Rename</button>
      </form>
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
            Amount in Rp. Positive = debt increased, negative = debt decreased (e.g. -500.000).
          </label>
          <MoneyInput
            name="delta"
            required
            allowNegative
            placeholder="-500.000,00"
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
          const monthPayments = payByMonth.get(s.month.getTime()) ?? [];
          const paidSum = monthPayments.reduce((a, p) => a + Number(p.amount), 0);
          const planned = Number(s.planned);
          const dueLeft = Math.max(0, planned - paidSum);
          const fullyPaid = paidSum >= planned && paidSum > 0;
          const partial = paidSum > 0 && !fullyPaid;
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
                {paidSum > 0 && (
                  <div className="text-[11px] text-inksoft">
                    paid {money.rp(paidSum)}
                    {partial && <b className="text-peachdeep"> · {money.rpShort(dueLeft)} left</b>}
                  </div>
                )}
              </div>
              <Popover
                trigger={money.rpShort(Number(s.planned))}
                triggerClass="font-extrabold money text-[13px] border-b border-dashed border-earth/50"
              >
                <form action={updateScheduleEntry} className="space-y-2">
                  <input type="hidden" name="entryId" value={s.id} />
                  <label className="block text-[10.5px] font-bold text-inksoft">
                    Planned installment for {monthLabel(s.month)}
                  </label>
                  <MoneyInput
                    name="planned"
                    required
                    defaultValue={Number(s.planned)}
                    className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right money"
                  />
                  <button className="w-full bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-2">
                    Update installment
                  </button>
                </form>
                <form action={deleteScheduleEntry}>
                  <input type="hidden" name="entryId" value={s.id} />
                  <button className="w-full border border-bad text-bad rounded-full text-[11px] font-extrabold py-2">
                    Remove month
                  </button>
                </form>
              </Popover>
              {paidSum > 0 && (
                <Popover
                  trigger={fullyPaid ? "Paid ▾" : "Partial ▾"}
                  triggerClass={
                    fullyPaid
                      ? "bg-goodbg text-good rounded-full text-[11px] font-extrabold px-3 py-1.5"
                      : "bg-warnbg text-warn rounded-full text-[11px] font-extrabold px-3 py-1.5"
                  }
                  width="w-64"
                >
                  <div className="text-[10.5px] font-bold text-inksoft uppercase tracking-wide">
                    {fullyPaid ? "✓ Fully paid" : `Partial — ${money.rpShort(dueLeft)} left`}
                  </div>
                  {monthPayments.map((p, i) => (
                    <div key={p.id} className="border-t border-line pt-2 space-y-2">
                      <div className="text-[10.5px] text-inksoft">
                        Payment {i + 1} ·{" "}
                        {p.paidDate.toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                      </div>
                      <form action={updateDebtPayment} className="flex gap-1.5">
                        <input type="hidden" name="paymentId" value={p.id} />
                        <div className="flex-1">
                          <MoneyInput
                            name="amount"
                            required
                            defaultValue={Number(p.amount)}
                            className="w-full rounded-md border border-line bg-cream2 px-2.5 py-1.5 text-xs text-right money"
                          />
                        </div>
                        <button className="bg-sagedeep text-cream2 rounded-full text-[10.5px] font-extrabold px-3">
                          Save
                        </button>
                      </form>
                      <form action={deleteDebtPayment}>
                        <input type="hidden" name="paymentId" value={p.id} />
                        <button className="w-full border border-bad text-bad rounded-full text-[10.5px] font-extrabold py-1.5">
                          Undo this payment
                        </button>
                      </form>
                    </div>
                  ))}
                  <p className="text-[10px] text-inksoft">
                    Undo returns the money to its account and reopens the amount.
                  </p>
                </Popover>
              )}
              {dueLeft > 0 && (
                <Popover
                  trigger={paidSum > 0 ? "Pay more" : isCurrent || s.month < now ? "Pay ✓" : "Pay early"}
                  triggerClass={
                    paidSum > 0 || isCurrent || s.month < now
                      ? "bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-3 py-1.5"
                      : "border border-line text-inksoft rounded-full text-[11px] font-bold px-3 py-1.5 hover:border-sagedeep hover:text-sagedeep"
                  }
                  width="w-64"
                >
                  <PayForm
                    debtId={debt.id}
                    monthIso={s.month.toISOString()}
                    dueLeft={dueLeft}
                    accounts={accountOptions}
                    backTo={`/debts/${debt.id}`}
                  />
                </Popover>
              )}
            </div>
          );
        })}
      </div>

      <details className="mb-6 max-w-md">
        <summary className="text-xs font-bold text-sagedeep cursor-pointer">
          + Add a month to the schedule
        </summary>
        <form action={addScheduleEntry} className="bg-card border border-line rounded-md p-3.5 mt-2 space-y-3">
          <input type="hidden" name="debtId" value={debt.id} />
          <div>
            <label className="block text-[11px] font-semibold text-inksoft mb-1">Month</label>
            <DateField name="month" mode="month" required title="Which month" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-inksoft mb-1">Amount</label>
            <MoneyInput
              name="planned"
              required
              placeholder="1.100.000,00"
              className="w-full rounded-md border border-line bg-cream2 px-3.5 py-3 text-sm text-right money"
            />
          </div>
          <button className="w-full bg-sagedeep text-cream2 rounded-full text-xs font-extrabold py-2.5">
            Add to schedule
          </button>
        </form>
      </details>

      {/* adjustments history */}
      {debt.adjustments.length > 0 && (
        <>
          <h2 className="text-sm font-bold mb-2">Adjustment history</h2>
          <div className="space-y-1.5">
            {debt.adjustments.slice(0, 5).map((a) => (
              <div key={a.id} className="bg-card border border-line rounded-md px-3.5 py-2.5 flex items-center gap-3 text-[12.5px]">
                <span className="text-inksoft flex-1">
                  {a.createdAt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                  {a.reason && ` · ${a.reason}`}
                </span>
                <span className={`font-extrabold money ${Number(a.delta) < 0 ? "text-good" : "text-bad"}`}>
                  {Number(a.delta) > 0 ? "+" : ""}
                  {money.rpShort(Number(a.delta))}
                </span>
                <form action={deleteDebtAdjustment}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-bad font-extrabold px-1" title="Remove adjustment">
                    ✕
                  </button>
                </form>
              </div>
            ))}
            {debt.adjustments.length > 5 && (
              <p className="text-[11.5px] text-inksoft text-center pt-1">
                Showing the 5 most recent of {debt.adjustments.length} adjustments.
              </p>
            )}
          </div>
        </>
      )}

      <details className="bg-badbg border border-bad/30 rounded-lg p-4 mt-6 max-w-md">
        <summary className="text-sm font-bold text-bad cursor-pointer">⚠️ Delete this debt</summary>
        <form action={deleteDebt} className="mt-3">
          <input type="hidden" name="debtId" value={debt.id} />
          <p className="text-[12.5px] text-bad mb-2.5">
            Removes the debt with its whole schedule, payments, and adjustments. Bank transactions
            you already made are kept. This cannot be undone.
          </p>
          <button className="rounded-full bg-bad text-white text-xs font-extrabold px-5 py-2.5">
            Delete {debt.lender} forever
          </button>
        </form>
      </details>
    </div>
  );
}
