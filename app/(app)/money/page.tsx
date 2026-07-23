import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { appliesIn, getDebtSummaries } from "@/lib/finance";
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
import { DebtCurve } from "@/components/Charts";
import MoneyInput from "@/components/MoneyInput";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";
import DateField from "@/components/DateField";

const TYPE_ICON: Record<string, string> = { BANK: "🏦", SAVINGS: "🌱", EWALLET: "📱", CASH: "💵" };

type Search = {
  tab?: string;
  all?: string;
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
  const tab = ["accounts", "debts", "plan"].includes(sp.tab ?? "") ? sp.tab! : "accounts";
  const money = await getMoney(userId);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">Money</h1>
        <Link
          href="/money/history"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-2 text-xs font-extrabold text-sagedeep"
        >
          🕑 History
        </Link>
      </div>
      <div className="flex gap-1 bg-card border border-line rounded-full p-1 mb-5 max-w-md">
        {[
          ["accounts", "Accounts"],
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

      {tab === "accounts" && (
        <AccountsTab userId={userId} spaceId={spaceId} money={money} showAll={sp.all === "1"} />
      )}
      {tab === "debts" && <DebtsTab userId={userId} spaceId={spaceId} money={money} />}
      {tab === "plan" && <PlanTab userId={userId} spaceId={spaceId} money={money} />}
    </div>
  );
}

function RepeatPicker({ defaultValue = "none" }: { defaultValue?: string }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold text-inksoft mb-1">Repeat for</label>
      <Select
        name="repeatMonths"
        defaultValue={defaultValue}
        label="Repeat for"
        options={[
          { value: "none", label: "No end — every month", icon: "♾️" },
          { value: "1", label: "This month only", icon: "1️⃣" },
          { value: "2", label: "2 months", icon: "🗓️" },
          { value: "3", label: "3 months", icon: "🗓️" },
          { value: "6", label: "6 months", icon: "🗓️" },
          { value: "12", label: "12 months", icon: "🗓️" },
          { value: "24", label: "2 years", icon: "🗓️" },
        ]}
      />
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
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({ where: { spaceId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.transaction.findMany({
      where: { spaceId, plannedId: { not: null }, date: { gte: now, lt: nextMonth } },
    }),
  ]);
  // debts are part of the monthly outgoings, straight from their own schedule
  const debtEntries = await prisma.debtScheduleEntry.findMany({
    where: { debt: { spaceId }, month: now, planned: { gt: 0 } },
    include: { debt: true },
    orderBy: { planned: "desc" },
  });
  const debtDue = debtEntries.reduce((a, e) => a + Number(e.planned), 0);

  const recordedTxByPlanned = new Map(monthTx.map((t) => [t.plannedId as string, t.id]));
  const live = items.filter((i) => appliesIn(i, now));
  const income = live.filter((i) => i.direction === "IN");
  const expense = live.filter((i) => i.direction === "OUT");
  const plannedIn = income.reduce((a, i) => a + Number(i.amount), 0);
  const planOnlyOut = expense.reduce((a, i) => a + Number(i.amount), 0);
  const plannedOut = planOnlyOut + debtDue;
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
                  {i.endMonth ? ` · until ${monthLabel(i.endMonth)}` : " · no end"}
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
                    <RepeatPicker
                      defaultValue={
                        i.endMonth
                          ? String(
                              Math.max(
                                1,
                                (i.endMonth.getUTCFullYear() - now.getUTCFullYear()) * 12 +
                                  (i.endMonth.getUTCMonth() - now.getUTCMonth()) +
                                  1,
                              ),
                            )
                          : "none"
                      }
                    />
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
          <RepeatPicker />
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
          {debtDue > 0 && (
            <div className="text-[9.5px] text-inksoft mt-0.5">incl. {money.rpShort(debtDue)} debt</div>
          )}
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

      {debtEntries.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-bold mb-1">Debt installments · {monthLabel(now)}</h2>
          <p className="text-[11.5px] text-inksoft mb-2">
            Added automatically from each debt&apos;s payment schedule, from the first payment to
            the last. Change them in the Debts tab.
          </p>
          <div className="space-y-2">
            {debtEntries.map((e) => (
              <Link
                key={e.id}
                href={`/debts/${e.debtId}`}
                className="bg-card border border-line rounded-md p-3 flex items-center gap-2.5 hover:border-sagedeep"
              >
                <span className="text-base">🏦</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px] truncate">{e.debt.lender}</div>
                  <div className="text-[11px] text-inksoft truncate">from the payment schedule</div>
                </div>
                <span className="font-extrabold money text-[13px] whitespace-nowrap text-peachdeep">
                  −{money.rpShort(Number(e.planned))}
                </span>
                <span className="text-inksoft text-xs">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

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

async function AccountsTab({ userId, spaceId, money, showAll }: Ctx & { showAll?: boolean }) {
  const accounts = await prisma.finAccount.findMany({
    where: { spaceId, archived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const counted = accounts.filter((a) => !a.hidden);
  const total = counted.reduce((a, x) => a + Number(x.balance), 0);
  const hiddenCount = accounts.length - counted.length;
  const visible = showAll ? accounts : accounts.slice(0, 5);

  return (
    <div className="max-w-md">
      <div className="bg-card border border-line rounded-lg p-4 mb-5 shadow-soft">
        <div className="text-[11px] uppercase tracking-wide text-inksoft">
          All accounts{hiddenCount > 0 ? ` · ${hiddenCount} hidden not counted` : ""}
        </div>
        <div className="font-display text-2xl font-bold money mt-0.5">{money.rp(total)}</div>
      </div>

      <div className="space-y-2 mb-4">
        {visible.map((a) => (
          <details key={a.id} className="bg-card border border-line rounded-md group">
            <summary className="p-3.5 flex items-center gap-3 cursor-pointer list-none">
              <span className="text-lg">{TYPE_ICON[a.type]}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13.5px] flex items-center gap-1.5">
                  <span className="truncate">{a.name}</span>
                  {a.primary && <span className="text-sagedeep text-[11px]">★</span>}
                </div>
                <div className="text-[11px] text-inksoft">
                  {a.type.toLowerCase()}
                  {a.hidden && " · hidden from totals"}
                </div>
              </div>
              <div className={`font-extrabold money text-[14px] ${a.hidden ? "text-inksoft" : ""}`}>
                {money.rp(Number(a.balance))}
              </div>
            </summary>
            <form action={updateAccountBalance} className="px-3.5 pb-3.5 space-y-2">
              <input type="hidden" name="accountId" value={a.id} />
              <input type="hidden" name="backTo" value="/money?tab=accounts" />
              <MoneyInput
                name="balance"
                defaultValue={Number(a.balance)}
                className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
              />
              <input
                name="reason"
                placeholder="Note (optional)"
                className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-xs"
              />
              <div className="flex gap-2">
                <SubmitButton
                  name="mode"
                  value="record"
                  className="flex-1 bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-2"
                  pendingText="…"
                >
                  Record difference
                </SubmitButton>
                <SubmitButton
                  name="mode"
                  value="correct"
                  className="flex-1 border border-line text-earth rounded-full text-[11px] font-extrabold py-2"
                  pendingText="…"
                >
                  Just correct
                </SubmitButton>
              </div>
            </form>
          </details>
        ))}
        {!showAll && accounts.length > 5 && (
          <Link
            href="/money?tab=accounts&all=1"
            className="block text-center text-xs font-extrabold text-sagedeep py-2"
          >
            See all {accounts.length} accounts →
          </Link>
        )}
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
