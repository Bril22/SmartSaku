import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getMoney } from "@/lib/money";
import { getDebtSummaries } from "@/lib/finance";
import { getCryptoPrices } from "@/lib/prices";
import { addHolding, deleteHolding, updateHolding } from "@/app/actions";
import MoneyInput from "@/components/MoneyInput";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";
import AddPanel from "@/components/AddPanel";
import EditableCard from "@/components/EditableCard";

const MANUAL_KINDS = [
  { value: "stock", label: "Stocks", icon: "📈" },
  { value: "fund", label: "Mutual fund (reksadana)", icon: "🏛️" },
  { value: "gold", label: "Gold (emas)", icon: "🥇" },
  { value: "other", label: "Other", icon: "📦" },
];
const kindMeta = (v: string) => MANUAL_KINDS.find((k) => k.value === v) ?? MANUAL_KINDS[3];

export default async function InvestPage() {
  const { userId, spaceId } = await requireSpace();
  const [money, holdings, accounts, debts, prices] = await Promise.all([
    getMoney(userId),
    prisma.holding.findMany({ where: { spaceId }, orderBy: { createdAt: "asc" } }),
    prisma.finAccount.findMany({ where: { spaceId, archived: false, hidden: false } }),
    getDebtSummaries(spaceId),
    getCryptoPrices(),
  ]);

  const valueOf = (h: (typeof holdings)[number]): number => {
    if (h.kind === "crypto") {
      const q = prices.get(h.symbol.toUpperCase());
      return q ? Math.round(h.quantity * q.idr * 100) : 0;
    }
    return Number(h.manualValue);
  };

  const cash = accounts.reduce((a, x) => a + Number(x.balance), 0);
  const invest = holdings.reduce((a, h) => a + valueOf(h), 0);
  const debt = debts.reduce((a, d) => a + d.remaining, 0);
  const netWorth = cash + invest - debt;

  const symbols = [...prices.keys()].sort();

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold mb-1">Wealth</h1>
      <p className="text-[12.5px] text-inksoft mb-4">
        Your net worth: cash and investments, minus debt. Crypto prices are live from Indodax;
        set everything else by hand.
      </p>

      <div
        className="rounded-lg p-5 text-cream2 mb-4"
        style={{ background: "linear-gradient(135deg,#31694E,#658C58)" }}
      >
        <div className="text-[11px] uppercase tracking-wider opacity-85">Net worth</div>
        <div className="font-display text-3xl font-bold money mt-0.5 mb-3">{money.rp(netWorth)}</div>
        <div className="flex gap-5 text-xs">
          <div>
            Cash
            <b className="block text-sm money">{money.rpShort(cash)}</b>
          </div>
          <div>
            Investments
            <b className="block text-sm money">{money.rpShort(invest)}</b>
          </div>
          <div>
            Debt
            <b className="block text-sm money">−{money.rpShort(debt)}</b>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <AddPanel label="Add crypto">
          <form action={addHolding} className="space-y-2.5">
            <input type="hidden" name="kind" value="crypto" />
            <input
              name="symbol"
              list="crypto-symbols"
              required
              placeholder="Coin (BTC, ETH…)"
              className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm uppercase"
            />
            <datalist id="crypto-symbols">
              {symbols.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <input
              name="quantity"
              type="number"
              step="any"
              min={0}
              required
              placeholder="Amount (0.25)"
              className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right"
            />
            <SubmitButton
              className="w-full rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold py-2.5"
              pendingText="…"
            >
              Add coin
            </SubmitButton>
          </form>
        </AddPanel>

        <AddPanel label="Add other">
          <form action={addHolding} className="space-y-2.5">
            <input
              name="name"
              required
              maxLength={60}
              placeholder="Name (BBCA, Antam…)"
              className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
            />
            <Select
              name="kind"
              label="Type"
              defaultValue="stock"
              options={MANUAL_KINDS.map((k) => ({ value: k.value, label: k.label, icon: k.icon }))}
            />
            <MoneyInput
              name="value"
              placeholder="Current value"
              className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
            />
            <SubmitButton
              className="w-full rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold py-2.5"
              pendingText="…"
            >
              Add
            </SubmitButton>
          </form>
        </AddPanel>
      </div>

      {holdings.length === 0 ? (
        <p className="text-[12.5px] text-inksoft">
          No investments yet. Add crypto for live prices, or anything else with its current value.
        </p>
      ) : (
        <div className="space-y-2">
          {holdings.map((h) => {
            const isCrypto = h.kind === "crypto";
            const quote = isCrypto ? prices.get(h.symbol.toUpperCase()) : null;
            const value = valueOf(h);
            const meta = isCrypto ? { icon: "🪙", label: "Crypto" } : kindMeta(h.kind);
            return (
              <EditableCard
                key={h.id}
                summary={
                  <span className="flex items-center gap-2.5">
                    <span className="text-lg">{meta.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-[13.5px] truncate">
                        {isCrypto ? `${h.quantity} ${h.symbol}` : h.name}
                      </span>
                      <span className="block text-[11px] text-inksoft truncate">
                        {isCrypto
                          ? quote
                            ? `${money.rpShort(Math.round(quote.idr * 100))} each · ${quote.name}`
                            : "No live price"
                          : meta.label}
                      </span>
                    </span>
                    <span className="font-bold text-[13px] money">{money.rpShort(value)}</span>
                  </span>
                }
              >
                <form action={updateHolding} className="space-y-2.5">
                  <input type="hidden" name="id" value={h.id} />
                  {isCrypto ? (
                    <div>
                      <label className="block text-[10.5px] font-bold text-inksoft mb-1">
                        Amount of {h.symbol}
                      </label>
                      <input
                        name="quantity"
                        type="number"
                        step="any"
                        min={0}
                        defaultValue={h.quantity}
                        className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right"
                      />
                    </div>
                  ) : (
                    <>
                      <input
                        name="name"
                        defaultValue={h.name}
                        maxLength={60}
                        className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm"
                      />
                      <MoneyInput
                        name="value"
                        defaultValue={Number(h.manualValue)}
                        className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right money"
                      />
                    </>
                  )}
                  <SubmitButton
                    className="w-full rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold py-2.5"
                    pendingText="Saving…"
                  >
                    Save
                  </SubmitButton>
                </form>
                <form action={deleteHolding} className="mt-2 text-center">
                  <input type="hidden" name="id" value={h.id} />
                  <button className="text-[11px] font-extrabold text-bad">Remove holding</button>
                </form>
              </EditableCard>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-inksoft mt-3">
        <Link href="/money" className="text-sagedeep font-bold">
          ‹ Back to Money
        </Link>
      </p>
    </div>
  );
}
