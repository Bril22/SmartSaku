"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MINOR, formatMinor, group } from "@/lib/format";

type CurrencyProps = { code?: string; ratePerIdr?: number; symbol?: string };

function makeFmt({ code = "IDR", ratePerIdr = 1, symbol = "Rp" }: CurrencyProps) {
  const short = (minor: number) => {
    const v = (minor * ratePerIdr) / MINOR;
    if (Math.abs(v) >= 1_000_000_000) return group(v / 1_000_000_000, 1) + (code === "IDR" ? "M" : "B");
    if (Math.abs(v) >= 1_000_000) return group(v / 1_000_000, 0) + (code === "IDR" ? "jt" : "M");
    if (Math.abs(v) >= 1_000) return group(v / 1_000, 0) + "rb";
    return group(v, 0);
  };
  const full = (minor: number) => symbol + formatMinor(minor * ratePerIdr);
  return { short, full };
}

export function DebtCurve({
  data,
  ...currency
}: { data: { label: string; debt: number }[] } & CurrencyProps) {
  const fmt = makeFmt(currency);
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#EBDCC3" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6F6350" }} interval="preserveStartEnd" minTickGap={40} />
          <YAxis tick={{ fontSize: 10, fill: "#6F6350" }} tickFormatter={fmt.short} width={42} />
          <Tooltip formatter={(v) => fmt.full(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #EBDCC3", fontSize: 12 }} />
          <Area isAnimationActive={false} type="monotone" dataKey="debt" name="Debt remaining" stroke="#C96F4A" strokeWidth={2.5} fill="#F3E0CE" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FutureChart({
  data,
  ...currency
}: {
  data: { label: string; savings: number; debt: number; netWorth: number }[];
} & CurrencyProps) {
  const fmt = makeFmt(currency);
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#EBDCC3" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6F6350" }} interval="preserveStartEnd" minTickGap={50} />
          <YAxis tick={{ fontSize: 10, fill: "#6F6350" }} tickFormatter={fmt.short} width={46} />
          <Tooltip formatter={(v) => fmt.full(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #EBDCC3", fontSize: 12 }} />
          <Area isAnimationActive={false} type="monotone" dataKey="savings" name="Savings" stroke="#31694E" strokeWidth={2.5} fill="rgba(187,200,99,.3)" />
          <Area isAnimationActive={false} type="monotone" dataKey="debt" name="Debt remaining" stroke="#C96F4A" strokeWidth={2} fill="rgba(232,160,124,.2)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
