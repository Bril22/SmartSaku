"use client";

import Link from "next/link";
import { useState } from "react";
import { shortMinor } from "@/lib/format";

export type CalTx = {
  id: string;
  day: number;
  amount: number;
  direction: "IN" | "OUT";
  icon: string;
  title: string;
  sub: string;
};

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export default function CalendarHistory({
  year,
  month,
  txs,
  fmtShort,
  currency,
}: {
  year: number;
  month: number;
  txs: CalTx[];
  fmtShort: { code: string; ratePerIdr: number; symbol: string };
  currency?: never;
}) {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

  const byDay = new Map<number, CalTx[]>();
  for (const t of txs) {
    if (!byDay.has(t.day)) byDay.set(t.day, []);
    byDay.get(t.day)!.push(t);
  }
  const defaultDay = isThisMonth
    ? today.getDate()
    : [...byDay.keys()].sort((a, b) => b - a)[0] ?? 1;
  const [selected, setSelected] = useState(defaultDay);
  const dayTxs = byDay.get(selected) ?? [];

  const fmt = (idr: number) => {
    return shortMinor(idr * fmtShort.ratePerIdr, fmtShort.symbol);
  };

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] font-bold text-inksoft py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-4">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={"b" + i} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const has = byDay.get(day);
          const hasIn = has?.some((t) => t.direction === "IN");
          const hasOut = has?.some((t) => t.direction === "OUT");
          const isToday = isThisMonth && day === today.getDate();
          return (
            <button
              key={day}
              onClick={() => setSelected(day)}
              className={`aspect-square rounded-lg text-[12px] font-semibold flex flex-col items-center justify-center gap-0.5 ${
                selected === day
                  ? "bg-sagedeep text-cream2"
                  : has
                    ? "bg-card border border-line"
                    : "text-inksoft"
              } ${isToday && selected !== day ? "border-2 border-sagedeep" : ""}`}
            >
              {day}
              <span className="flex gap-0.5 h-1.5">
                {hasIn && <span className={`w-1.5 h-1.5 rounded-full ${selected === day ? "bg-sun" : "bg-leaf"}`} />}
                {hasOut && <span className={`w-1.5 h-1.5 rounded-full ${selected === day ? "bg-peach" : "bg-peachdeep"}`} />}
              </span>
            </button>
          );
        })}
      </div>

      <h3 className="text-sm font-bold mb-2">
        {new Date(Date.UTC(year, month, selected)).toLocaleDateString("en-US", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </h3>
      {dayTxs.length === 0 && (
        <div className="text-sm text-inksoft bg-card border border-line rounded-md p-4">
          No transactions on this day.
        </div>
      )}
      <div className="space-y-1.5">
        {dayTxs.map((t) => (
          <Link
            key={t.id}
            href={`/money/tx/${t.id}`}
            className="bg-card border border-line rounded-md px-3.5 py-2.5 flex items-center gap-3 hover:border-sagedeep"
          >
            <span className="text-base">{t.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px] truncate">{t.title}</div>
              <div className="text-[11px] text-inksoft truncate">{t.sub}</div>
            </div>
            <span
              className={`font-extrabold money text-[13px] ${t.direction === "IN" ? "text-sagedeep" : "text-peachdeep"}`}
            >
              {t.direction === "IN" ? "+" : "−"}
              {fmt(t.amount)}
            </span>
            <span className="text-inksoft text-xs">✎</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
