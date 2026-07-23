"use client";

import { useMemo, useState } from "react";
import { formatMinor } from "@/lib/format";
import { comparePayoff, type PayoffDebt, type StrategyResult } from "@/lib/payoff";

function monthsLabel(m: number): string {
  if (m <= 0) return "0 months";
  const y = Math.floor(m / 12);
  const mo = m % 12;
  if (!y) return `${mo} month${mo === 1 ? "" : "s"}`;
  if (!mo) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y} yr ${mo} mo`;
}

export default function PayoffPlanner({
  debts,
  symbol,
  ratePerIdr,
  startMonthOffset,
}: {
  debts: PayoffDebt[];
  symbol: string;
  ratePerIdr: number;
  /** epoch ms for the first month, so the finish date is computed on the server clock */
  startMonthOffset: number;
}) {
  const [extraRp, setExtraRp] = useState(0); // rupiah (major)
  const extra = extraRp * 100; // minor units

  const fmt = (v: number) => symbol + formatMinor(v * ratePerIdr);
  const lenderById = useMemo(
    () => new Map(debts.map((d) => [d.id, d.lender])),
    [debts],
  );

  const cmp = useMemo(() => comparePayoff(debts, extra), [debts, extra]);

  const finishLabel = (m: number) => {
    if (m <= 0) return "";
    const d = new Date(startMonthOffset);
    d.setUTCMonth(d.getUTCMonth() + m - 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  };

  const sliderMax = Math.max(2_000_000, Math.round(cmp.minMonthly / 100) * 2);

  const card = (title: string, sub: string, r: StrategyResult, accent: string) => (
    <div className="bg-card border border-line rounded-lg p-4 flex-1 min-w-0">
      <div className="text-sm font-bold">{title}</div>
      <div className="text-[11px] text-inksoft mb-2">{sub}</div>
      {r.neverPaysOff ? (
        <p className="text-[12px] text-bad font-semibold">
          Payments are below the interest — this never clears. Raise the minimum or add extra.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xl font-bold" style={{ color: accent }}>
              {monthsLabel(r.months)}
            </span>
            {finishLabel(r.months) && (
              <span className="text-[11px] text-inksoft">· {finishLabel(r.months)}</span>
            )}
          </div>
          <div className="text-[12px] text-inksoft money mt-1">
            Interest paid: <b className="text-ink">{fmt(r.totalInterest)}</b>
          </div>
          {r.order.length > 0 && (
            <div className="text-[11px] text-inksoft mt-1.5 truncate">
              Order: {r.order.map((id) => lenderById.get(id) ?? "?").join(" → ")}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div>
      <div className="bg-card border border-line rounded-lg p-4 mb-4">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-inksoft">Total owed</span>
          <span className="font-display text-lg font-bold money">{fmt(cmp.totalBalance)}</span>
        </div>
        <div className="flex items-baseline justify-between text-[12px] text-inksoft">
          <span>Minimums / month</span>
          <span className="money">{fmt(cmp.minMonthly)}</span>
        </div>
      </div>

      <div className="bg-card border border-line rounded-lg p-4 mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="extra" className="text-sm font-bold">
            Extra per month
          </label>
          <span className="font-display text-lg font-bold money text-sagedeep">
            {fmt(extra)}
          </span>
        </div>
        <input
          id="extra"
          type="range"
          min={0}
          max={sliderMax}
          step={50_000}
          value={Math.min(extraRp, sliderMax)}
          onChange={(e) => setExtraRp(Number(e.target.value))}
          className="w-full accent-sagedeep"
        />
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {[0, 250_000, 500_000, 1_000_000, 2_000_000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setExtraRp(v)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${
                extraRp === v ? "bg-goodbg text-sagedeep" : "text-inksoft border border-line"
              }`}
            >
              {v === 0 ? "None" : "+" + formatMinor(v * 100).replace(",00", "")}
            </button>
          ))}
        </div>
      </div>

      {extra > 0 && cmp.monthsSaved > 0 && (
        <div className="bg-goodbg rounded-lg p-4 mb-4 text-center">
          <div className="text-[12px] text-sagedeep font-semibold">
            Paying {fmt(extra)} extra each month makes you
          </div>
          <div className="font-display text-xl font-bold text-sagedeep my-1">
            debt-free {monthsLabel(cmp.monthsSaved)} sooner
          </div>
          <div className="text-[12px] text-sagedeep money">
            and saves <b>{fmt(cmp.interestSaved)}</b> in interest.
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {card("Avalanche", "Highest rate first — least interest", cmp.avalanche, "#31694E")}
        {card("Snowball", "Smallest balance first — quick wins", cmp.snowball, "#C96F4A")}
      </div>
      <p className="text-[11.5px] text-inksoft mt-3">
        Avalanche costs the least. Snowball clears a whole debt sooner, which some people find
        easier to keep up. Both assume you keep paying every minimum.
      </p>
    </div>
  );
}
