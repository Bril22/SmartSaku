/** Money is stored as minor units (1/100 of the currency). One place decides the scale. */
export const MINOR = 100;

/** id-ID grouping with a fixed number of decimals: 1.234.567,89 */
export function group(v: number, digits: number): string {
  return v.toLocaleString("id-ID", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** minor units -> "1.234.567,89" */
export function formatMinor(minor: number | bigint): string {
  return group(Number(minor) / MINOR, 2);
}

/** "1.234.567,89" | "1234567,89" | "1234567" -> minor units */
export function parseMinor(text: string): number {
  const cleaned = String(text).replace(/[^0-9,-]/g, "");
  const negative = cleaned.startsWith("-");
  const [intPart = "", decPart = ""] = cleaned.replace(/-/g, "").split(",");
  const minor =
    BigInt(intPart || "0") * BigInt(MINOR) + BigInt(decPart.padEnd(2, "0").slice(0, 2) || "0");
  return Number(negative ? -minor : minor);
}

/** compact IDR for tight spaces, from minor units */
export function shortMinor(minor: number | bigint, symbol = "Rp"): string {
  const v = Number(minor) / MINOR;
  if (Math.abs(v) >= 1_000_000_000) return symbol + group(v / 1_000_000_000, 2) + "M";
  if (Math.abs(v) >= 1_000_000) return symbol + group(v / 1_000_000, 1) + "jt";
  if (Math.abs(v) >= 1_000) return symbol + group(v / 1_000, 0) + "rb";
  return symbol + group(v, 2);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(d: Date): string {
  return MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
}

/** first day of month in UTC, matching DB @db.Date convention */
export function monthKey(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
}

export function addMonths(m: Date, n: number): Date {
  return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1));
}
