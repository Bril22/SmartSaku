"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export type PieSlice = { name: string; value: number; icon?: string };

const PALETTE = [
  "#31694E",
  "#C96F4A",
  "#BBC863",
  "#827148",
  "#E8A07C",
  "#658C58",
  "#C79A3D",
  "#A5AF79",
  "#D9B08C",
  "#8A9B6E",
];

export default function CategoryPie({
  data,
  code = "IDR",
  ratePerIdr = 1,
  symbol = "Rp",
  emptyText = "No transactions in this period.",
}: {
  data: PieSlice[];
  code?: string;
  ratePerIdr?: number;
  symbol?: string;
  emptyText?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total <= 0) {
    return <div className="text-sm text-inksoft text-center py-8">{emptyText}</div>;
  }
  const fmt = (idr: number) => {
    const v = idr * ratePerIdr;
    return (
      symbol +
      v.toLocaleString("en-US", { maximumFractionDigits: code === "IDR" || code === "JPY" ? 0 : 2 })
    );
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-2">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={80}
              paddingAngle={2}
              stroke="#FFF7EA"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => fmt(Number(v))}
              contentStyle={{ borderRadius: 12, border: "1px solid #EBDCC3", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 w-full space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="flex-1 truncate">
              {d.icon} {d.name}
            </span>
            <span className="font-bold money">{fmt(d.value)}</span>
            <span className="text-inksoft w-10 text-right">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
