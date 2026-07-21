import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getDebtSummaries } from "@/lib/finance";
import { monthKey, monthLabel } from "@/lib/format";
import { getMoney } from "@/lib/money";
import { addAccount, addDebt, updateAccountBalance } from "@/app/actions";
import CalendarHistory, { type CalTx } from "@/components/CalendarHistory";
import CategoryPie, { type PieSlice } from "@/components/CategoryPie";
import { DebtCurve } from "@/components/Charts";
import MoneyInput from "@/components/MoneyInput";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";

const TYPE_ICON: Record<string, string> = { BANK: "🏦", SAVINGS: "🌱", EWALLET: "📱", CASH: "💵" };

type Search = {
  tab?: string;
  month?: string;
  range?: string;
  from?: string;
  to?: string;
  kind?: string;
};

export default async function MoneyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const tab = ["accounts", "history", "debts"].includes(sp.tab ?? "") ? sp.tab! : "accounts";
  const money = await getMoney(userId);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-4">Money</h1>
      <div className="flex gap-1 bg-card border border-line rounded-full p-1 mb-5 max-w-md">
        {[
          ["accounts", "Accounts"],
          ["history", "History"],
          ["debts", "Debts"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/money?tab=${key}`}
            className={`flex-1 text-center px-3 py-2 rounded-full text-xs font-extrabold ${
              tab === key ? "bg-sagedeep text-cream2" : "text-inksoft"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "accounts" && <AccountsTab userId={userId} money={money} />}
      {tab === "history" && <HistoryTab userId={userId} money={money} sp={sp} />}
      {tab === "debts" && <DebtsTab userId={userId} money={money} />}
    </div>
  );
}

type MoneyCtx = Awaited<ReturnType<typeof getMoney>>;

async function AccountsTab({ userId, money }: { userId: string; money: MoneyCtx }) {
  const accounts = await prisma.finAccount.findMany({
    where: { userId, archived: false },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });
  const total = accounts.reduce((a, x) => a + Number(x.balance), 0);

  return (
    <div className="max-w-md">
      <div className="bg-card border border-line rounded-lg p-4 mb-5 shadow-soft">
        <div className="text-[11px] uppercase tracking-wide text-inksoft">All accounts</div>
        <div className="font-display text-2xl font-bold money mt-0.5">{money.rp(total)}</div>
      </div>

      <div className="space-y-2 mb-4">
        {accounts.map((a) => (
          <details key={a.id} className="bg-card border border-line rounded-md group">
            <summary className="p-3.5 flex items-center gap-3 cursor-pointer list-none">
              <span className="text-lg">{TYPE_ICON[a.type]}</span>
              <div className="flex-1">
                <div className="font-bold text-[13.5px]">{a.name}</div>
                <div className="text-[11px] text-inksoft">{a.type.toLowerCase()}</div>
              </div>
              <div className="font-extrabold money text-[14px]">{money.rp(Number(a.balance))}</div>
            </summary>
            <form action={updateAccountBalance} className="px-3.5 pb-3.5 flex gap-2 items-center">
              <input type="hidden" name="accountId" value={a.id} />
              <div className="flex-1">
                <MoneyInput
                  name="balance"
                  defaultValue={Number(a.balance)}
                  className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right money"
                />
              </div>
              <SubmitButton
                className="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-4 py-2"
                pendingText="…"
              >
                Set balance
              </SubmitButton>
            </form>
          </details>
        ))}
      </div>

      <details className="mb-2">
        <summary className="text-xs font-bold text-sagedeep cursor-pointer">+ Add account</summary>
        <form action={addAccount} className="bg-card border border-line rounded-md p-3.5 mt-2 space-y-2">
          <input type="hidden" name="backTo" value="/money" />
          <input
            name="name"
            placeholder="Account name (e.g. BCA)"
            required
            className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <Select
                name="type"
                defaultValue="BANK"
                options={[
                  { value: "BANK", label: "Bank", icon: "🏦" },
                  { value: "SAVINGS", label: "Savings", icon: "🌱" },
                  { value: "EWALLET", label: "E-wallet", icon: "📱" },
                  { value: "CASH", label: "Cash", icon: "💵" },
                ]}
              />
            </div>
            <div className="flex-1">
              <MoneyInput
                name="balance"
                placeholder="Balance"
                className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right"
              />
            </div>
          </div>
          <SubmitButton
            className="bg-sagedeep text-cream2 rounded-full text-xs font-extrabold px-4 py-2"
            pendingText="…"
          >
            Create
          </SubmitButton>
        </form>
      </details>
      <p className="text-[11.5px] text-inksoft">
        Rename, archive, or delete accounts in{" "}
        <Link href="/settings/accounts" className="text-sagedeep font-bold">
          Settings › Manage accounts
        </Link>
        .
      </p>
    </div>
  );
}

async function HistoryTab({
  userId,
  money,
  sp,
}: {
  userId: string;
  money: MoneyCtx;
  sp: Search;
}) {
  const now = new Date();
  const [yStr, mStr] = (sp.month ?? "").split("-");
  const year = Number(yStr) || now.getUTCFullYear();
  const month = mStr ? Number(mStr) - 1 : now.getUTCMonth();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 1));

  const range = ["day", "week", "month", "custom"].includes(sp.range ?? "") ? sp.range! : "month";
  const kind = sp.kind === "in" ? "IN" : "OUT";
  let rangeStart = monthStart;
  let rangeEnd = monthEnd;
  let rangeLabel = monthLabel(monthStart);
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (range === "day") {
    rangeStart = todayUTC;
    rangeEnd = new Date(todayUTC.getTime() + 86400000);
    rangeLabel = "Today";
  } else if (range === "week") {
    rangeStart = new Date(todayUTC.getTime() - 6 * 86400000);
    rangeEnd = new Date(todayUTC.getTime() + 86400000);
    rangeLabel = "Last 7 days";
  } else if (range === "custom" && sp.from && sp.to) {
    rangeStart = new Date(sp.from + "T00:00:00Z");
    rangeEnd = new Date(new Date(sp.to + "T00:00:00Z").getTime() + 86400000);
    rangeLabel = `${sp.from} → ${sp.to}`;
  }

  const [monthTxs, rangeTxs] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: monthStart, lt: monthEnd } },
      include: { category: true, account: true },
      orderBy: { date: "desc" },
    }),
    prisma.transaction.findMany({
      where: { userId, date: { gte: rangeStart, lt: rangeEnd } },
      include: { category: true },
    }),
  ]);

  const groups = new Map<string, PieSlice>();
  for (const t of rangeTxs) {
    if (t.direction !== kind) continue;
    const name = t.category?.name ?? "No category";
    const icon = t.category?.icon ?? "🏷️";
    const g = groups.get(name) ?? { name, icon, value: 0 };
    g.value += Number(t.amount);
    groups.set(name, g);
  }
  const pieData = [...groups.values()].sort((a, b) => b.value - a.value);

  const calTxs: CalTx[] = monthTxs.map((t) => ({
    id: t.id,
    day: t.date.getUTCDate(),
    amount: Number(t.amount),
    direction: t.direction,
    icon: t.category?.icon ?? (t.direction === "IN" ? "💰" : "💸"),
    title: t.category?.name || t.note || "Transaction",
    sub: `${t.account.name}${t.note && t.category ? " · " + t.note : ""}`,
  }));

  const prevMonth = `${month === 0 ? year - 1 : year}-${String(month === 0 ? 12 : month).padStart(2, "0")}`;
  const nextMonth = `${month === 11 ? year + 1 : year}-${String(month === 11 ? 1 : month + 2).padStart(2, "0")}`;

  return (
    <div>
    <div className="flex justify-end mb-3 -mt-2">
      <Link
        href="/import"
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-4 py-2 text-xs font-extrabold text-sagedeep"
      >
        📄 Import from file (AI)
      </Link>
    </div>
    <div className="md:grid md:grid-cols-2 md:gap-8 md:items-start">
      <div className="bg-card border border-line rounded-lg p-4 mb-5 md:mb-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold">
            {kind === "OUT" ? "Expenses" : "Income"} · {rangeLabel}
          </h2>
          <div className="flex gap-1">
            <Link
              href={`/money?tab=history&month=${sp.month ?? ""}&range=${range}&from=${sp.from ?? ""}&to=${sp.to ?? ""}&kind=out`}
              className={`px-2.5 py-1 rounded-full text-[10.5px] font-extrabold ${kind === "OUT" ? "bg-peachdeep text-white" : "text-inksoft border border-line"}`}
            >
              Expenses
            </Link>
            <Link
              href={`/money?tab=history&month=${sp.month ?? ""}&range=${range}&from=${sp.from ?? ""}&to=${sp.to ?? ""}&kind=in`}
              className={`px-2.5 py-1 rounded-full text-[10.5px] font-extrabold ${kind === "IN" ? "bg-sagedeep text-cream2" : "text-inksoft border border-line"}`}
            >
              Income
            </Link>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {[
            ["day", "Today"],
            ["week", "7 days"],
            ["month", "This month"],
          ].map(([r, label]) => (
            <Link
              key={r}
              href={`/money?tab=history&month=${sp.month ?? ""}&range=${r}&kind=${kind.toLowerCase()}`}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${range === r ? "bg-goodbg text-sagedeep" : "text-inksoft border border-line"}`}
            >
              {label}
            </Link>
          ))}
          <details className="relative">
            <summary
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold cursor-pointer list-none ${range === "custom" ? "bg-goodbg text-sagedeep" : "text-inksoft border border-line"}`}
            >
              Custom
            </summary>
            <form
              method="GET"
              action="/money"
              className="absolute z-30 mt-1.5 bg-card border border-line rounded-md p-3 flex flex-col gap-2 shadow-soft w-52"
            >
              <input type="hidden" name="tab" value="history" />
              <input type="hidden" name="range" value="custom" />
              <input type="hidden" name="kind" value={kind.toLowerCase()} />
              <input type="date" name="from" required className="rounded-md border border-line bg-cream2 px-2 py-1.5 text-xs" />
              <input type="date" name="to" required className="rounded-md border border-line bg-cream2 px-2 py-1.5 text-xs" />
              <button className="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-1.5">
                Apply
              </button>
            </form>
          </details>
        </div>
        <CategoryPie
          data={pieData}
          code={money.code}
          ratePerIdr={money.ratePerIdr}
          symbol={money.symbol}
        />
      </div>

      <div className="bg-card border border-line rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/money?tab=history&month=${prevMonth}&range=${range}&kind=${kind.toLowerCase()}`}
            className="w-8 h-8 rounded-full border border-line flex items-center justify-center font-bold text-inksoft"
          >
            ‹
          </Link>
          <h2 className="text-sm font-bold">{monthLabel(monthStart)}</h2>
          <Link
            href={`/money?tab=history&month=${nextMonth}&range=${range}&kind=${kind.toLowerCase()}`}
            className="w-8 h-8 rounded-full border border-line flex items-center justify-center font-bold text-inksoft"
          >
            ›
          </Link>
        </div>
        <CalendarHistory
          year={year}
          month={month}
          txs={calTxs}
          fmtShort={{ code: money.code, ratePerIdr: money.ratePerIdr, symbol: money.symbol }}
        />
      </div>
    </div>
    </div>
  );
}

async function DebtsTab({ userId, money }: { userId: string; money: MoneyCtx }) {
  const debts = await getDebtSummaries(userId);
  const totalRemaining = debts.reduce((a, d) => a + d.remaining, 0);

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
      <div className="bg-card border border-line rounded-lg p-4 mb-4 shadow-soft">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-[11px] uppercase tracking-wide text-inksoft">Total remaining</div>
          <div className="font-extrabold money text-peachdeep">{money.rpShort(totalRemaining)}</div>
        </div>
        {curve.length > 0 ? (
          <DebtCurve
            data={curve}
            code={money.code}
            ratePerIdr={money.ratePerIdr}
            symbol={money.symbol}
          />
        ) : (
          <div className="text-sm text-good font-bold py-6 text-center">Lunas! You are debt-free 🎉</div>
        )}
      </div>

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {debts.map((d) => {
          const done = d.remaining <= 0;
          return (
            <Link
              key={d.id}
              href={`/debts/${d.id}`}
              className="block bg-card border border-line rounded-md p-3.5 hover:shadow-soft"
            >
              <div className="flex justify-between text-[13.5px] font-bold mb-0.5">
                <span>
                  {d.lender} {done && <span className="text-good">✓</span>}
                </span>
                <span className={`money ${done ? "text-good" : ""}`}>
                  {done ? "Lunas!" : money.rpShort(d.remaining)}
                </span>
              </div>
              <div className="flex justify-between text-[11.5px] text-inksoft mb-2">
                <span>{done ? "fully paid" : `paid ${d.progressPct}%`}</span>
                <span>{!done && d.finishMonth ? `finishes ${monthLabel(d.finishMonth)}` : ""}</span>
              </div>
              <div className="h-2 rounded-full bg-cream overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${d.progressPct}%`, background: done ? "#31694E" : d.color }}
                />
              </div>
              <div className="text-[11px] text-sagedeep font-bold mt-2">
                View history & payments ›
              </div>
            </Link>
          );
        })}
      </div>
      <details className="mt-4 max-w-md">
        <summary className="text-xs font-bold text-sagedeep cursor-pointer">+ Add debt</summary>
        <form action={addDebt} className="bg-card border border-line rounded-md p-3.5 mt-2 space-y-2.5">
          <input
            name="lender"
            required
            maxLength={40}
            placeholder="Lender name (e.g. KTA Bank Biru)"
            className="w-full rounded-md border border-line bg-cream2 px-3.5 py-2.5 text-sm"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-inksoft mb-1">Total remaining</label>
              <MoneyInput
                name="total"
                required
                placeholder="12,000,000"
                className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-inksoft mb-1">Monthly payment</label>
              <MoneyInput
                name="monthly"
                required
                placeholder="1,000,000"
                className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-inksoft mb-1">First payment month</label>
            <input
              type="month"
              name="start"
              className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
            />
          </div>
          <SubmitButton
            className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
            pendingText="Adding…"
          >
            Add debt
          </SubmitButton>
        </form>
      </details>
      <p className="text-[11.5px] text-inksoft mt-3">
        Open a debt to see every month&apos;s payment, edit or remove payments, rename it, and
        adjust the balance — the forecast updates automatically.
      </p>
    </div>
  );
}
