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

function fmtShort(v: number) {
  if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(0) + "jt";
  return String(v);
}

function fmtFull(v: number) {
  return "Rp" + Math.round(v).toLocaleString("id-ID");
}

export function DebtCurve({ data }: { data: { label: string; debt: number }[] }) {
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#EBDCC3" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6F6350" }} interval="preserveStartEnd" minTickGap={40} />
          <YAxis tick={{ fontSize: 10, fill: "#6F6350" }} tickFormatter={fmtShort} width={42} />
          <Tooltip formatter={(v) => fmtFull(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #EBDCC3", fontSize: 12 }} />
          <Area type="monotone" dataKey="debt" name="Debt remaining" stroke="#C96F4A" strokeWidth={2.5} fill="#F3E0CE" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FutureChart({
  data,
}: {
  data: { label: string; savings: number; debt: number; netWorth: number }[];
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#EBDCC3" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6F6350" }} interval="preserveStartEnd" minTickGap={50} />
          <YAxis tick={{ fontSize: 10, fill: "#6F6350" }} tickFormatter={fmtShort} width={46} />
          <Tooltip formatter={(v) => fmtFull(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #EBDCC3", fontSize: 12 }} />
          <Area type="monotone" dataKey="savings" name="Savings" stroke="#31694E" strokeWidth={2.5} fill="rgba(187,200,99,.3)" />
          <Area type="monotone" dataKey="debt" name="Debt remaining" stroke="#C96F4A" strokeWidth={2} fill="rgba(232,160,124,.2)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
