import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { monthLabel } from "@/lib/format";
import { getMoney } from "@/lib/money";
import Popover from "@/components/Popover";
import CalendarHistory, { type CalTx } from "@/components/CalendarHistory";
import CategoryPie, { type PieSlice } from "@/components/CategoryPie";
import DateField from "@/components/DateField";

type Search = {
  month?: string;
  range?: string;
  from?: string;
  to?: string;
  kind?: string;
  q?: string;
};

const HISTORY = "/money/history";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { userId, spaceId } = await requireSpace();
  const sp = await searchParams;
  const money = await getMoney(userId);

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
  const matches = query
    ? {
        OR: [
          { note: { contains: query, mode: "insensitive" as const } },
          { category: { name: { contains: query, mode: "insensitive" as const } } },
          { account: { name: { contains: query, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const [monthTxs, rangeTxs] = await Promise.all([
    prisma.transaction.findMany({
      where: { spaceId, date: { gte: monthStart, lt: monthEnd }, ...matches },
      include: { category: true, account: true },
      orderBy: { date: "desc" },
    }),
    prisma.transaction.findMany({
      where: { spaceId, date: { gte: rangeStart, lt: rangeEnd }, ...matches },
      include: { category: true },
    }),
  ]);

  const groups = new Map<string, PieSlice>();
  let rangeIn = 0;
  let rangeOut = 0;
  for (const t of rangeTxs) {
    if (t.direction === "IN") rangeIn += Number(t.amount);
    else rangeOut += Number(t.amount);
    if (t.direction !== kind) continue;
    const name = t.category?.name ?? "No category";
    const icon = t.category?.icon ?? "🏷️";
    const g = groups.get(name) ?? { name, icon, value: 0 };
    g.value += Number(t.amount);
    groups.set(name, g);
  }
  const pieData = [...groups.values()].sort((a, b) => b.value - a.value);
  const kindTotal = kind === "IN" ? rangeIn : rangeOut;

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
  const q = kind.toLowerCase();

  return (
    <div>
      <Link href="/money" className="text-xs font-bold text-sagedeep">
        ‹ Money
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-4">History</h1>

      <div className="mb-4 space-y-2">
        <form method="GET" action={HISTORY} className="flex flex-col sm:flex-row gap-2">
          <input type="hidden" name="month" value={sp.month ?? ""} />
          <input type="hidden" name="range" value={range} />
          <input type="hidden" name="kind" value={q} />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search notes, categories, accounts…"
            className="w-full sm:flex-1 min-w-0 rounded-full border border-line bg-card px-4 py-3 text-sm"
          />
          <div className="flex gap-2">
            <button className="flex-1 sm:flex-none rounded-full bg-sagedeep text-cream2 px-6 py-3 text-xs font-extrabold">
              Search
            </button>
            {query && (
              <Link
                href={`${HISTORY}?month=${sp.month ?? ""}&range=${range}&kind=${q}`}
                className="rounded-full border border-line px-4 py-3 text-xs font-extrabold text-inksoft flex items-center"
              >
                Clear
              </Link>
            )}
          </div>
        </form>
        <Link
          href="/import"
          className="flex items-center gap-2.5 rounded-full border border-line bg-card px-4 py-2.5 text-xs font-extrabold text-sagedeep"
        >
          <span className="text-base">📄</span>
          Scan a file with Saku AI
        </Link>
        {query && (
          <p className="text-[11.5px] text-inksoft px-1">
            Chart and calendar below show only matches for “{query}”.
          </p>
        )}
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-8 md:items-start">
        <div className="bg-card border border-line rounded-lg p-4 mb-5 md:mb-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">
              {kind === "OUT" ? "Expenses" : "Income"} · {rangeLabel}
            </h2>
            <div className="flex gap-1">
              <Link
                href={`${HISTORY}?month=${sp.month ?? ""}&range=${range}&from=${sp.from ?? ""}&to=${sp.to ?? ""}&kind=out&q=${encodeURIComponent(query)}`}
                className={`px-2.5 py-1 rounded-full text-[10.5px] font-extrabold ${kind === "OUT" ? "bg-peachdeep text-white" : "text-inksoft border border-line"}`}
              >
                Expenses
              </Link>
              <Link
                href={`${HISTORY}?month=${sp.month ?? ""}&range=${range}&from=${sp.from ?? ""}&to=${sp.to ?? ""}&kind=in&q=${encodeURIComponent(query)}`}
                className={`px-2.5 py-1 rounded-full text-[10.5px] font-extrabold ${kind === "IN" ? "bg-sagedeep text-cream2" : "text-inksoft border border-line"}`}
              >
                Income
              </Link>
            </div>
          </div>

          <div
            className={`rounded-md px-3.5 py-2.5 mb-3 flex items-baseline justify-between ${
              kind === "IN" ? "bg-goodbg" : "bg-badbg"
            }`}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-inksoft">
              Total {kind === "IN" ? "income" : "spent"}
            </span>
            <span
              className={`font-display font-bold text-lg money ${
                kind === "IN" ? "text-sagedeep" : "text-peachdeep"
              }`}
            >
              {kind === "IN" ? "+" : "−"}
              {money.rp(kindTotal)}
            </span>
          </div>

          <div className="flex gap-1.5 flex-wrap mb-3">
            {[
              ["day", "Today"],
              ["week", "7 days"],
              ["month", "This month"],
            ].map(([r, label]) => (
              <Link
                key={r}
                href={`${HISTORY}?month=${sp.month ?? ""}&range=${r}&kind=${q}&q=${encodeURIComponent(query)}`}
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
              <form method="GET" action={HISTORY} className="flex flex-col gap-2">
                <input type="hidden" name="range" value="custom" />
                <input type="hidden" name="kind" value={q} />
                <input type="hidden" name="q" value={query} />
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
              href={`${HISTORY}?month=${prevMonth}&range=${range}&kind=${q}`}
              className="w-8 h-8 rounded-full border border-line flex items-center justify-center font-bold text-inksoft"
            >
              ‹
            </Link>
            <h2 className="text-sm font-bold">{monthLabel(monthStart)}</h2>
            <Link
              href={`${HISTORY}?month=${nextMonth}&range=${range}&kind=${q}`}
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
            dayQuery={query ? `?q=${encodeURIComponent(query)}` : ""}
          />
        </div>
      </div>
    </div>
  );
}
