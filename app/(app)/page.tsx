import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getDebtSummaries } from "@/lib/finance";
import { monthKey, monthLabel, rp, rpShort } from "@/lib/format";
import { payDebtMonth } from "@/app/actions";

export default async function HomePage() {
  const userId = await requireUserId();
  const now = monthKey();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [user, accounts, debts, monthTx, bills] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.finAccount.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { name: "asc" }] }),
    getDebtSummaries(userId),
    prisma.transaction.findMany({
      where: { userId, date: { gte: now, lt: nextMonth } },
    }),
    prisma.recurringBill.findMany({ where: { userId, active: true } }),
  ]);

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
  const defaultAccount = accounts[0];

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
      {/* hero */}
      <div className="rounded-lg p-5 text-cream2 mb-4" style={{ background: "linear-gradient(135deg,#31694E,#658C58)" }}>
        <div className="text-[11px] uppercase tracking-wider opacity-85">Total savings</div>
        <div className="font-display text-3xl font-bold money mt-0.5 mb-3">{rp(totalSavings)}</div>
        <div className="flex gap-5 text-xs">
          <div>
            Debt left
            <b className="block text-sm money">{rpShort(totalDebt)}</b>
          </div>
          <div>
            This month
            <b className="block text-sm money">{rpShort(dueThisMonth.reduce((a, d) => a + d.thisMonthPlanned, 0))}</b>
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
          <div className="font-extrabold text-sagedeep money mt-1">+{rpShort(incomeThisMonth)}</div>
        </div>
        <div className="bg-card border border-line rounded-md p-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-inksoft">Spent ({monthLabel(now)})</div>
          <div className="font-extrabold text-peachdeep money mt-1">−{rpShort(spentThisMonth)}</div>
        </div>
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
            <div className="font-extrabold money mt-1 text-[15px]">{rp(Number(a.balance))}</div>
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
        <Link href="/debts" className="text-xs font-bold text-sagedeep">
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
            <div className="font-extrabold text-[13px] money whitespace-nowrap">{rpShort(d.thisMonthPlanned)}</div>
            {d.thisMonthStatus === "PAID" ? (
              <span className="bg-goodbg text-good rounded-full text-[11px] font-extrabold px-3 py-1.5">Paid</span>
            ) : (
              <form action={payDebtMonth}>
                <input type="hidden" name="debtId" value={d.id} />
                <input type="hidden" name="month" value={now.toISOString()} />
                <input type="hidden" name="amount" value={d.thisMonthPlanned} />
                {defaultAccount && <input type="hidden" name="accountId" value={defaultAccount.id} />}
                <input type="hidden" name="backTo" value="/" />
                <button className="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-3 py-1.5">
                  Pay ✓
                </button>
              </form>
            )}
          </div>
        ))}

        {bills.map((b) => (
          <div key={b.id} className="bg-card border border-line rounded-md p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-[11px] bg-warnbg flex items-center justify-center text-base shrink-0">🧾</div>
            <div className="flex-1 min-w-0">
              <span className="font-bold text-[13.5px] block truncate">{b.name}</span>
              <span className="text-[11.5px] text-inksoft">due day {b.dueDay}</span>
            </div>
            <div className="font-extrabold text-[13px] money whitespace-nowrap">{rpShort(Number(b.amount))}</div>
          </div>
        ))}
      </div>

      </div>
      </div>
    </div>
  );
}
