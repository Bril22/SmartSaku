export function rp(n: number | bigint): string {
  const v = Math.round(Number(n));
  return "Rp" + v.toLocaleString("id-ID");
}

export function rpShort(n: number | bigint): string {
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000_000) return "Rp" + (v / 1_000_000_000).toFixed(2) + "M"; // miliar
  if (Math.abs(v) >= 1_000_000) return "Rp" + (v / 1_000_000).toFixed(1) + "jt";
  if (Math.abs(v) >= 1_000) return "Rp" + (v / 1_000).toFixed(0) + "rb";
  return "Rp" + v.toFixed(0);
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
