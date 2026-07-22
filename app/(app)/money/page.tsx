import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getDebtSummaries } from "@/lib/finance";
import { monthKey, monthLabel } from "@/lib/format";
import { getMoney } from "@/lib/money";
import {
  addAccount,
  addDebt,
  addPlanned,
  deletePlanned,
  deleteTransaction,
  recordPlanned,
  updateAccountBalance,
  updatePlanned,
} from "@/app/actions";
import Popover from "@/components/Popover";
import CalendarHistory, { type CalTx } from "@/components/CalendarHistory";
import CategoryPie, { type PieSlice } from "@/components/CategoryPie";
import { DebtCurve } from "@/components/Charts";
import MoneyInput from "@/components/MoneyInput";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";
import DateField from "@/components/DateField";

const TYPE_ICON: Record<string, string> = { BANK: "🏦", SAVINGS: "🌱", EWALLET: "📱", CASH: "💵" };

type Search = {
  tab?: string;
  month?: string;
  range?: string;
  from?: string;
  to?: string;
  kind?: string;
  q?: string;
};

export default async function MoneyPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { userId, spaceId } = await requireSpace();
  const sp = await searchParams;
  const tab = ["accounts", "history", "debts", "plan"].includes(sp.tab ?? "") ? sp.tab! : "accounts";
  const money = await getMoney(userId);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold mb-4">Money</h1>
      <div className="flex gap-1 bg-card border border-line rounded-full p-1 mb-5 max-w-md">
        {[
          ["accounts", "Accounts"],
          ["history", "History"],
          ["debts", "Debts"],
          ["plan", "Plan"],
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

      {tab === "accounts" && <AccountsTab userId={userId} spaceId={spaceId} money={money} />}
      {tab === "history" && <HistoryTab userId={userId} spaceId={spaceId} money={money} sp={sp} />}
      {tab === "debts" && <DebtsTab userId={userId} spaceId={spaceId} money={money} />}
      {tab === "plan" && <PlanTab userId={userId} spaceId={spaceId} money={money} />}
    </div>
  );
}

async function PlanTab({ userId, spaceId, money }: Ctx) {
  const now = monthKey();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [items, accounts, categories, monthTx] = await Promise.all([
    prisma.plannedTransaction.findMany({
      where: { spaceId, active: true },
      include: { account: true, category: true },
      orderBy: [{ direction: "asc" }, { dayOfMonth: "asc" }],
    }),
    prisma.finAccount.findMany({
      where: { spaceId, archived: false },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({ where: { spaceId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.transaction.findMany({
      where: { spaceId, plannedId: { not: null }, date: { gte: now, lt: nextMonth } },
    }),
  ]);
  const recordedTxByPlanned = new Map(monthTx.map((t) => [t.plannedId as string, t.id]));
  const income = items.filter((i) => i.direction === "IN");
  const expense = items.filter((i) => i.direction === "OUT");
  const plannedIn = income.reduce((a, i) => a + Number(i.amount), 0);
  const plannedOut = expense.reduce((a, i) => a + Number(i.amount), 0);
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name, icon: "🏦" }));
  const catOptions = (type: "INCOME" | "EXPENSE") => [
    { value: "", label: "No category" },
    ...categories.filter((c) => c.type === type).map((c) => ({ value: c.id, label: c.name, icon: c.icon })),
  ];

  const Section = ({
    title,
    list,
    direction,
  }: {
    title: string;
    list: typeof items;
    direction: "IN" | "OUT";
  }) => (
    <section className="mb-6">
      <h2 className="text-sm font-bold mb-2">{title}</h2>
      <div className="space-y-2">
        {list.length === 0 && (
          <div className="text-[12.5px] text-inksoft bg-card border border-line rounded-md p-3.5">
            Nothing planned yet — add your monthly {direction === "IN" ? "income" : "expenses"} below.
          </div>
        )}
        {list.map((i) => {
          const recordedTxId = recordedTxByPlanned.get(i.id);
          const recorded = !!recordedTxId;
          return (
            <div key={i.id} className="bg-card border border-line rounded-md p-3 flex items-center gap-2.5">
              <span className="text-base">{i.category?.icon ?? (direction === "IN" ? "💰" : "🧾")}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13px] truncate">{i.name}</div>
                <div className="text-[11px] text-inksoft truncate">
                  day {i.dayOfMonth}
                  {i.account ? ` · ${i.account.name}` : ""}
                  {i.category ? ` · ${i.category.name}` : ""}
                </div>
              </div>
              <span
                className={`font-extrabold money text-[13px] whitespace-nowrap ${direction === "IN" ? "text-sagedeep" : "text-peachdeep"}`}
              >
                {direction === "IN" ? "+" : "−"}
                {money.rpShort(Number(i.amount))}
              </span>
              {recorded ? (
                <Popover
                  trigger="✓ ▾"
                  triggerClass="bg-goodbg text-good rounded-full text-[11px] font-extrabold px-2.5 py-1.5"
                  width="w-56"
                >
                  <div className="text-[11px] font-bold text-good">Recorded this month</div>
                  <form action={deleteTransaction}>
                    <input type="hidden" name="id" value={recordedTxId} />
                    <input type="hidden" name="backTo" value="/money?tab=plan" />
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
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="backTo" value="/money?tab=plan" />
                  <button className="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-2.5 py-1.5">
                    Record
                  </button>
                </form>
              )}
              <Popover trigger="✎" triggerClass="text-inksoft px-1" width="w-64">
                <form action={updatePlanned} className="space-y-2">
                  <input type="hidden" name="id" value={i.id} />
                  <input
                    name="name"
                    defaultValue={i.name}
                    required
                    maxLength={40}
                    className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <MoneyInput
                        name="amount"
                        required
                        defaultValue={Number(i.amount)}
                        className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right money"
                      />
                    </div>
                    <input
                      name="dayOfMonth"
                      type="number"
                      min={1}
                      max={28}
                      defaultValue={i.dayOfMonth}
                      className="w-16 rounded-md border border-line bg-cream2 px-2 py-2 text-sm text-center"
                    />
                  </div>
                  <Select name="accountId" defaultValue={i.accountId ?? ""} placeholder="Any account" options={[{ value: "", label: "Any account" }, ...accountOptions]} />
                  <Select name="categoryId" defaultValue={i.categoryId ?? ""} placeholder="No category" options={catOptions(direction === "IN" ? "INCOME" : "EXPENSE")} />
                  <button className="w-full bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-2">
                    Save
                  </button>
                </form>
                <form action={deletePlanned}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="w-full border border-bad text-bad rounded-full text-[11px] font-extrabold py-2">
                    Remove from plan
                  </button>
                </form>
              </Popover>
            </div>
          );
        })}
      </div>
      <details className="mt-2.5">
        <summary className="text-xs font-bold text-sagedeep cursor-pointer">
          + Add planned {direction === "IN" ? "income" : "expense"}
        </summary>
        <form action={addPlanned} className="bg-card border border-line rounded-md p-3.5 mt-2 space-y-2">
          <input type="hidden" name="direction" value={direction} />
          <input
            name="name"
            required
            maxLength={40}
            placeholder={direction === "IN" ? "Salary from BCA" : "Rent, electricity, …"}
            className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <MoneyInput
                name="amount"
                required
                placeholder="5.000.000,00"
                className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
              />
            </div>
            <div>
              <input
                name="dayOfMonth"
                type="number"
                min={1}
                max={28}
                defaultValue={1}
                title="Day of month"
                className="w-16 rounded-md border border-line bg-cream2 px-2 py-2.5 text-sm text-center"
              />
            </div>
          </div>
          <Select name="accountId" placeholder="Any account" options={[{ value: "", label: "Any account" }, ...accountOptions]} />
          <Select name="categoryId" placeholder="No category" options={catOptions(direction === "IN" ? "INCOME" : "EXPENSE")} />
          <SubmitButton
            className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
            pendingText="Adding…"
          >
            Add to plan
          </SubmitButton>
        </form>
      </details>
    </section>
  );

  return (
    <div className="max-w-xl">
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Planned income</div>
          <div className="font-extrabold text-sagedeep money mt-1">+{money.rpShort(plannedIn)}</div>
        </div>
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Planned expenses</div>
          <div className="font-extrabold text-peachdeep money mt-1">−{money.rpShort(plannedOut)}</div>
        </div>
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Monthly surplus</div>
          <div className={`font-extrabold money mt-1 ${plannedIn - plannedOut < 0 ? "text-bad" : ""}`}>
            {money.rpShort(plannedIn - plannedOut)}
          </div>
        </div>
      </div>

      <Section title={`Income plan · ${monthLabel(now)}`} list={income} direction="IN" />
      <Section title={`Expense plan · ${monthLabel(now)}`} list={expense} direction="OUT" />

      <p className="text-[11.5px] text-inksoft">
        &quot;Record&quot; creates the real transaction for this month and updates the account
        balance. The Forecast page uses your planned totals automatically. Debt installments are
        tracked separately in the Debts tab.
      </p>
    </div>
  );
}

type MoneyCtx = Awaited<ReturnType<typeof getMoney>>;
type Ctx = { userId: string; spaceId: string; money: MoneyCtx };

async function AccountsTab({ userId, spaceId, money }: Ctx) {
  const accounts = await prisma.finAccount.findMany({
    where: { spaceId, archived: false },
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

async function HistoryTab({ userId, spaceId, money, sp }: Ctx & { sp: Search }) {
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

  const query = (sp.q ?? "").trim();
  const searchResults = query
    ? await prisma.transaction.findMany({
        where: {
          userId,
          OR: [
            { note: { contains: query, mode: "insensitive" } },
            { category: { name: { contains: query, mode: "insensitive" } } },
            { account: { name: { contains: query, mode: "insensitive" } } },
          ],
        },
        include: { category: true, account: true },
        orderBy: { date: "desc" },
        take: 100,
      })
    : [];

  const [monthTxs, rangeTxs] = await Promise.all([
    prisma.transaction.findMany({
      where: { spaceId, date: { gte: monthStart, lt: monthEnd } },
      include: { category: true, account: true },
      orderBy: { date: "desc" },
    }),
    prisma.transaction.findMany({
      where: { spaceId, date: { gte: rangeStart, lt: rangeEnd } },
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
    <div className="flex items-center gap-2 mb-3 -mt-2">
      <form method="GET" action="/money" className="flex-1 flex gap-2">
        <input type="hidden" name="tab" value="history" />
        <input
          name="q"
          defaultValue={query}
          placeholder="Search notes, categories, accounts…"
          className="flex-1 min-w-0 rounded-full border border-line bg-card px-4 py-2 text-xs"
        />
        <button className="rounded-full bg-sagedeep text-cream2 px-4 py-2 text-xs font-extrabold shrink-0">
          Search
        </button>
      </form>
      <Link
        href="/import"
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 text-xs font-extrabold text-sagedeep shrink-0"
        title="Import from file with AI"
      >
        📄 AI
      </Link>
    </div>

    {query && (
      <div className="bg-card border border-line rounded-lg p-4 mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-bold">
            {searchResults.length} result{searchResults.length === 1 ? "" : "s"} for “{query}”
          </h2>
          <Link href="/money?tab=history" className="text-xs font-bold text-sagedeep">
            Clear
          </Link>
        </div>
        <div className="space-y-1.5">
          {searchResults.length === 0 && (
            <p className="text-[12.5px] text-inksoft">Nothing matched. Try another word.</p>
          )}
          {searchResults.map((t) => (
            <Link
              key={t.id}
              href={`/money/tx/${t.id}`}
              className="bg-cream2 rounded-md px-3.5 py-2.5 flex items-center gap-3 hover:border-sagedeep border border-transparent"
            >
              <span className="text-base">
                {t.category?.icon ?? (t.direction === "IN" ? "💰" : "💸")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13px] truncate">
                  {t.category?.name || t.note || "Transaction"}
                </div>
                <div className="text-[11px] text-inksoft truncate">
                  {t.account.name} ·{" "}
                  {t.date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                  {t.note && t.category ? ` · ${t.note}` : ""}
                </div>
              </div>
              <span
                className={`font-extrabold money text-[13px] whitespace-nowrap ${t.direction === "IN" ? "text-sagedeep" : "text-peachdeep"}`}
              >
                {t.direction === "IN" ? "+" : "−"}
                {money.rpShort(Number(t.amount))}
              </span>
            </Link>
          ))}
        </div>
      </div>
    )}
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
          <Popover
            trigger="Custom"
            triggerClass={`px-3 py-1.5 rounded-full text-[11px] font-bold ${range === "custom" ? "bg-goodbg text-sagedeep" : "text-inksoft border border-line"}`}
            width="w-56"
          >
            <form method="GET" action="/money" className="flex flex-col gap-2">
              <input type="hidden" name="tab" value="history" />
              <input type="hidden" name="range" value="custom" />
              <input type="hidden" name="kind" value={kind.toLowerCase()} />
              <DateField name="from" required placeholder="From" title="From date" className="!py-2 text-xs" />
              <DateField name="to" required placeholder="To" title="To date" className="!py-2 text-xs" />
              <button className="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-1.5">
                Apply
              </button>
            </form>
          </Popover>
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

async function DebtsTab({ userId, spaceId, money }: Ctx) {
  const debts = await getDebtSummaries(spaceId);
  const totalRemaining = debts.reduce((a, d) => a + d.remaining, 0);

  const entries = await prisma.debtScheduleEntry.findMany({
    where: { debt: { spaceId }, month: { gte: monthKey() } },
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
                placeholder="12.000.000,00"
                className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-inksoft mb-1">Monthly payment</label>
              <MoneyInput
                name="monthly"
                required
                placeholder="1.000.000,00"
                className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-inksoft mb-1">First payment month</label>
            <DateField name="start" mode="month" placeholder="Pick a month" title="First payment month" />
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
