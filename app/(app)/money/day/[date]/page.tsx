import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getMoney } from "@/lib/money";

export default async function DayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { userId, spaceId } = await requireSpace();
  const { date } = await params;
  const { q } = await searchParams;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const start = new Date(date + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400000);
  const query = (q ?? "").trim();
  const matches = query
    ? {
        OR: [
          { note: { contains: query, mode: "insensitive" as const } },
          { category: { name: { contains: query, mode: "insensitive" as const } } },
          { account: { name: { contains: query, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const [txs, money] = await Promise.all([
    prisma.transaction.findMany({
      where: { spaceId, date: { gte: start, lt: end }, ...matches },
      include: { category: true, account: true },
      orderBy: { date: "desc" },
    }),
    getMoney(userId),
  ]);

  // transfers move money between own accounts — not income or spending
  const income = txs
    .filter((t) => t.direction === "IN" && t.kind !== "TRANSFER")
    .reduce((a, t) => a + Number(t.amount), 0);
  const spent = txs
    .filter((t) => t.direction === "OUT" && t.kind !== "TRANSFER")
    .reduce((a, t) => a + Number(t.amount), 0);
  const label = start.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="max-w-md">
      <Link href="/money/history" className="text-xs font-bold text-sagedeep">
        ‹ History
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-1">{label}</h1>
      <p className="text-[12px] text-inksoft mb-4">
        {txs.length} transaction{txs.length === 1 ? "" : "s"}
        {query && ` matching “${query}”`}
      </p>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Income</div>
          <div className="font-extrabold money text-sagedeep mt-0.5">+{money.rp(income)}</div>
        </div>
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Spent</div>
          <div className="font-extrabold money text-peachdeep mt-0.5">−{money.rp(spent)}</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {txs.length === 0 && (
          <div className="text-sm text-inksoft bg-card border border-line rounded-md p-4">
            Nothing on this day.
          </div>
        )}
        {txs.map((t) => (
          <Link
            key={t.id}
            href={`/money/tx/${t.id}`}
            className="bg-card border border-line rounded-md px-3.5 py-2.5 flex items-center gap-3 hover:border-sagedeep"
          >
            <span className="text-base">
              {t.kind === "TRANSFER" ? "⇄" : t.category?.icon ?? (t.direction === "IN" ? "💰" : "💸")}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px] truncate">
                {t.kind === "TRANSFER" ? "Transfer" : t.category?.name || t.note || "Transaction"}
              </div>
              <div className="text-[11px] text-inksoft truncate">
                {t.date.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}{" "}
                · {t.account.name}
                {t.note && t.category ? ` · ${t.note}` : ""}
              </div>
            </div>
            <span
              className={`font-extrabold money text-[13px] whitespace-nowrap ${
                t.kind === "TRANSFER"
                  ? "text-earth"
                  : t.direction === "IN"
                    ? "text-sagedeep"
                    : "text-peachdeep"
              }`}
            >
              {t.kind === "TRANSFER" ? "⇄ " : t.direction === "IN" ? "+" : "−"}
              {money.rp(Number(t.amount))}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
