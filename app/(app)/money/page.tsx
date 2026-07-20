import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getMoney } from "@/lib/money";
import { addAccount, updateAccountBalance } from "@/app/actions";
import MoneyInput from "@/components/MoneyInput";

const TYPE_ICON: Record<string, string> = { BANK: "🏦", SAVINGS: "🌱", EWALLET: "📱", CASH: "💵" };

export default async function MoneyPage() {
  const userId = await requireUserId();
  const [accounts, txs, money] = await Promise.all([
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    }),
    prisma.transaction.findMany({
      where: { userId },
      include: { category: true, account: true },
      orderBy: { date: "desc" },
      take: 30,
    }),
    getMoney(userId),
  ]);
  const total = accounts.reduce((a, x) => a + Number(x.balance), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl font-semibold">Money</h1>
        <Link href="/add" className="bg-peachdeep text-white rounded-full text-xs font-extrabold px-4 py-2">
          + Add transaction
        </Link>
      </div>

      <div className="md:grid md:grid-cols-2 md:gap-8 md:items-start">
      <div>
      <div className="bg-card border border-line rounded-lg p-4 mb-5 shadow-soft">
        <div className="text-[11px] uppercase tracking-wide text-inksoft">All accounts</div>
        <div className="font-display text-2xl font-bold money mt-0.5">{money.rp(total)}</div>
      </div>

      <h2 className="text-sm font-bold mb-2">Accounts</h2>
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
              <button className="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-4 py-2">
                Set balance
              </button>
            </form>
          </details>
        ))}
      </div>

      <details className="mb-6">
        <summary className="text-xs font-bold text-sagedeep cursor-pointer">+ Add account</summary>
        <form action={addAccount} className="bg-card border border-line rounded-md p-3.5 mt-2 space-y-2">
          <input
            name="name"
            placeholder="Account name (e.g. BCA)"
            required
            className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select name="type" className="flex-1 rounded-md border border-line bg-cream2 px-3 py-2 text-sm">
              <option value="BANK">Bank</option>
              <option value="SAVINGS">Savings</option>
              <option value="EWALLET">E-wallet</option>
              <option value="CASH">Cash</option>
            </select>
            <div className="flex-1">
              <MoneyInput
                name="balance"
                placeholder="Balance"
                className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right"
              />
            </div>
          </div>
          <button className="bg-sagedeep text-cream2 rounded-full text-xs font-extrabold px-4 py-2">Create</button>
        </form>
      </details>
      </div>

      <div>
      <h2 className="text-sm font-bold mb-2">Recent transactions</h2>
      <div className="space-y-1.5">
        {txs.length === 0 && (
          <div className="text-sm text-inksoft bg-card border border-line rounded-md p-4">
            No transactions yet. Tap <b>+</b> to add your first one.
          </div>
        )}
        {txs.map((t) => (
          <div key={t.id} className="bg-card border border-line rounded-md px-3.5 py-2.5 flex items-center gap-3">
            <span className="text-base">{t.category?.icon ?? (t.direction === "IN" ? "💰" : "💸")}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px] truncate">
                {t.category?.name || t.note || "Transaction"}
              </div>
              <div className="text-[11px] text-inksoft">
                {t.account.name} · {t.date.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                {t.note && t.category ? ` · ${t.note}` : ""}
              </div>
            </div>
            <div
              className={`font-extrabold money text-[13px] ${t.direction === "IN" ? "text-sagedeep" : "text-peachdeep"}`}
            >
              {t.direction === "IN" ? "+" : "−"}
              {money.rpShort(Number(t.amount))}
            </div>
          </div>
        ))}
      </div>
      </div>
      </div>
    </div>
  );
}
