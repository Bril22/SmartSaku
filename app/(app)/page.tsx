import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getDebtSummaries } from "@/lib/finance";
import { monthKey, monthLabel } from "@/lib/format";
import { getMoney } from "@/lib/money";
import { deleteTransaction, recordPlanned } from "@/app/actions";
import CategoryPie from "@/components/CategoryPie";
import PayForm from "@/components/PayForm";
import Popover from "@/components/Popover";

export default async function HomePage() {
  const userId = await requireUserId();
  const now = monthKey();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [user, accounts, debts, monthTx, bills, money] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    }),
    getDebtSummaries(userId),
    prisma.transaction.findMany({
      where: { userId, date: { gte: now, lt: nextMonth } },
      include: { category: true },
    }),
    prisma.plannedTransaction.findMany({
      where: { userId, active: true, direction: "OUT" },
      orderBy: { dayOfMonth: "asc" },
    }),
    getMoney(userId),
  ]);
  const recordedTxByPlanned = new Map(
    monthTx.filter((t) => t.plannedId).map((t) => [t.plannedId as string, t.id]),
  );
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name, icon: "🏦" }));

  const totalSavings = accounts.reduce((a, x) => a + Number(x.balance), 0);
  const totalDebt = debts.reduce((a, d) => a + d.remaining, 0);
  const dueThisMonth = debts.filter((d) => d.thisMonthPlanned > 0);
  const unpaid = dueThisMonth.filter((d) => d.thisMonthStatus === "DUE");
  const incomeThisMonth = monthTx
    .filter((t) => t.direction === "IN")
    .reduce((a, t) => a + Number(t.amount), 0);
  const spentThisMonth = monthTx
    .filter((t) => t.direction === "OUT")
    .reduce((a, t) => a + Number(t.amount), 0);
  const freeDate = debts.reduce<Date | null>(
    (a, d) => (d.remaining > 0 && d.finishMonth && (!a || d.finishMonth > a) ? d.finishMonth : a),
    null,
  );

  const spendGroups = new Map<string, { name: string; icon: string; value: number }>();
  for (const t of monthTx) {
    if (t.direction !== "OUT") continue;
    const name = t.category?.name ?? "No category";
    const g = spendGroups.get(name) ?? { name, icon: t.category?.icon ?? "🏷️", value: 0 };
    g.value += Number(t.amount);
    spendGroups.set(name, g);
  }
  const spendPie = [...spendGroups.values()].sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs text-inksoft">Welcome back ☀️</div>
          <div className="font-display text-xl font-semibold">{user?.name ?? "there"}</div>
        </div>
        <Link href="/settings" title="Settings">
          <Image
            src="/brand/mascot-abacus.png"
            alt="Settings"
            width={40}
            height={40}
            className="rounded-full border-2 border-sage bg-cream2 object-cover"
          />
        </Link>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-8 md:items-start">
      <div>
      {/* hero with peeking mascot */}
      <div className="relative">
        <Image
          src="/brand/mascot-wave.png"
          alt=""
          width={72}
          height={118}
          className="absolute -top-14 md:right-6 right-45 z-0 pointer-events-none"
        />
      </div>
      <div className="relative z-10 rounded-lg p-5 text-cream2 mb-4" style={{ background: "linear-gradient(135deg,#31694E,#658C58)" }}>
        <div className="text-[11px] uppercase tracking-wider opacity-85">Total savings</div>
        <div className="font-display text-3xl font-bold money mt-0.5 mb-3">{money.rp(totalSavings)}</div>
        <div className="flex gap-5 text-xs">
          <div>
            Debt left
            <b className="block text-sm money">{money.rpShort(totalDebt)}</b>
          </div>
          <div>
            This month
            <b className="block text-sm money">{money.rpShort(dueThisMonth.reduce((a, d) => a + d.thisMonthPlanned, 0))}</b>
          </div>
          <div>
            Debt-free
            <b className="block text-sm">{freeDate ? monthLabel(freeDate) : "Lunas! 🎉"}</b>
          </div>
        </div>
      </div>

      {/* month in/out */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-card border border-line rounded-md p-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-inksoft">Income ({monthLabel(now)})</div>
          <div className="font-extrabold text-sagedeep money mt-1">+{money.rpShort(incomeThisMonth)}</div>
        </div>
        <div className="bg-card border border-line rounded-md p-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-inksoft">Spent ({monthLabel(now)})</div>
          <div className="font-extrabold text-peachdeep money mt-1">−{money.rpShort(spentThisMonth)}</div>
        </div>
      </div>

      {/* spending breakdown */}
      <div className="bg-card border border-line rounded-lg p-4 mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-bold">Spending by category ({monthLabel(now)})</h2>
          <Link href="/money?tab=history" className="text-xs font-bold text-sagedeep">
            History
          </Link>
        </div>
        <CategoryPie
          data={spendPie}
          code={money.code}
          ratePerIdr={money.ratePerIdr}
          symbol={money.symbol}
          emptyText="No expenses yet this month. 🌱"
        />
      </div>

      {/* accounts strip */}
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold">Accounts</h2>
        <Link href="/money" className="text-xs font-bold text-sagedeep">
          Manage
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-6 md:mb-0">
        {accounts.map((a) => (
          <div key={a.id} className="bg-card border border-line rounded-md p-3.5">
            <div className="text-[10.5px] uppercase tracking-wide text-inksoft">{a.name}</div>
            <div className="font-extrabold money mt-1 text-[15px]">{money.rp(Number(a.balance))}</div>
          </div>
        ))}
      </div>
      </div>

      <div>
      {/* checklist */}
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-bold">
          To pay this month{unpaid.length > 0 && ` · ${unpaid.length} left`}
        </h2>
        <Link href="/money?tab=debts" className="text-xs font-bold text-sagedeep">
          See all
        </Link>
      </div>

      <div className="space-y-2 mb-6">
        {dueThisMonth.length === 0 && (
          <div className="bg-goodbg text-good rounded-md px-4 py-3 text-sm font-semibold">
            Nothing due this month. 🌱
          </div>
        )}
        {dueThisMonth.map((d) => (
          <div key={d.id} className="bg-card border border-line rounded-md p-3 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-[11px] flex items-center justify-center text-base shrink-0"
              style={{ background: d.thisMonthStatus === "PAID" ? "#E9EFD8" : "#FBE8DC" }}
            >
              🏦
            </div>
            <div className="flex-1 min-w-0">
              <Link href={`/debts/${d.id}`} className="font-bold text-[13.5px] block truncate">
                {d.lender}
              </Link>
              <span className="text-[11.5px] text-inksoft">{monthLabel(now)} installment</span>
            </div>
            <div className="font-extrabold text-[13px] money whitespace-nowrap">
              {d.thisMonthStatus === "PARTIAL"
                ? money.rpShort(d.thisMonthPlanned - d.thisMonthPaid) + " left"
                : money.rpShort(d.thisMonthPlanned)}
            </div>
            {d.thisMonthStatus === "PAID" ? (
              <Link
                href={`/debts/${d.id}`}
                className="bg-goodbg text-good rounded-full text-[11px] font-extrabold px-3 py-1.5"
                title="Open to edit or undo"
              >
                Paid ›
              </Link>
            ) : (
              <Popover
                trigger={d.thisMonthStatus === "PARTIAL" ? "Pay more" : "Pay ▾"}
                triggerClass="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-3 py-1.5"
                width="w-64"
              >
                <PayForm
                  debtId={d.id}
                  monthIso={now.toISOString()}
                  dueLeft={d.thisMonthPlanned - d.thisMonthPaid}
                  accounts={accountOptions}
                  backTo="/"
                />
              </Popover>
            )}
          </div>
        ))}

        {bills.map((b) => {
          const recordedTxId = recordedTxByPlanned.get(b.id);
          const recorded = !!recordedTxId;
          return (
            <div key={b.id} className="bg-card border border-line rounded-md p-3 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-[11px] flex items-center justify-center text-base shrink-0"
                style={{ background: recorded ? "#E9EFD8" : "#F7ECD4" }}
              >
                🧾
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-[13.5px] block truncate">{b.name}</span>
                <span className="text-[11.5px] text-inksoft">planned · day {b.dayOfMonth}</span>
              </div>
              <div className="font-extrabold text-[13px] money whitespace-nowrap">{money.rpShort(Number(b.amount))}</div>
              {recorded ? (
                <Popover
                  trigger="Paid ▾"
                  triggerClass="bg-goodbg text-good rounded-full text-[11px] font-extrabold px-3 py-1.5"
                  width="w-56"
                >
                  <div className="text-[11px] font-bold text-good">Recorded this month</div>
                  <form action={deleteTransaction}>
                    <input type="hidden" name="id" value={recordedTxId} />
                    <input type="hidden" name="backTo" value="/?home=1" />
                    <button className="w-full border border-bad text-bad rounded-full text-[11px] font-extrabold py-2">
                      Undo record
                    </button>
                  </form>
                  <p className="text-[10px] text-inksoft">
                    Removes this month&apos;s transaction and restores the balance.
                  </p>
                </Popover>
              ) : (
                <form action={recordPlanned}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="backTo" value="/?home=1" />
                  <button className="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-3 py-1.5">
                    Record ✓
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      </div>
      </div>
    </div>
  );
}
