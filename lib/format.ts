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

/* ---- editor helpers: the string a user types <-> stored minor units ---- */

/** what the user is typing, grouped: "1234567,8" -> "1.234.567,8" */
export function typedDisplay(raw: string): string {
  if (!raw) return "";
  const negative = raw.startsWith("-");
  const body = raw.replace("-", "");
  const [intPart, decPart] = body.split(",");
  const grouped = intPart ? BigInt(intPart).toLocaleString("id-ID") : "";
  let out = (negative ? "-" : "") + grouped;
  if (body.includes(",")) out += "," + (decPart ?? "");
  return out;
}

/** keep only digits, one comma, an optional leading minus, max 2 decimals */
export function normaliseTyped(text: string, allowNegative: boolean): string {
  let raw = text.replace(/[^0-9,-]/g, "");
  raw = allowNegative ? raw.replace(/(?!^)-/g, "") : raw.replace(/-/g, "");
  const negative = raw.startsWith("-");
  const body = raw.replace(/-/g, "");
  const [intPart, ...rest] = body.split(",");
  let out = intPart.replace(/^0+(?=\d)/, "");
  if (rest.length) out += "," + rest.join("").slice(0, 2);
  return (negative ? "-" : "") + out;
}

/** typed string -> minor units, as the string a hidden input submits */
export function typedToMinor(raw: string): string {
  if (!raw || raw === "-") return "";
  const negative = raw.startsWith("-");
  const [intPart = "", decPart = ""] = raw.replace("-", "").split(",");
  const minor =
    BigInt(intPart || "0") * BigInt(MINOR) + BigInt(decPart.padEnd(2, "0").slice(0, 2) || "0");
  return String(negative ? -minor : minor);
}

/* ---- inline calculator: a small, safe arithmetic evaluator ---- */

/** true when the typed value holds a binary operator, not just a leading minus */
export function hasMathOperator(text: string): boolean {
  return /[+*/]/.test(text) || /[0-9,.)]\s*-/.test(text);
}

/**
 * Evaluate a simple money expression like "15.000+3.500" or "20000*3".
 * Numbers use id-ID grouping: "." groups thousands, "," is the decimal.
 * Supports + - * / and parentheses. Returns major units, or null if invalid.
 */
export function evalMoneyExpr(input: string): number | null {
  const s = input.trim();
  if (!s) return null;

  const tokens: Array<number | string> = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " ") {
      i++;
      continue;
    }
    if ("+-*/()".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    if (/[0-9.,]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.,]/.test(s[j])) j++;
      const numStr = s.slice(i, j).replace(/\./g, "").replace(",", ".");
      const n = Number(numStr);
      if (!Number.isFinite(n)) return null;
      tokens.push(n);
      i = j;
      continue;
    }
    return null;
  }
  if (!tokens.length) return null;

  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const output: Array<number | string> = [];
  const ops: string[] = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (typeof t === "number") {
      output.push(t);
    } else if (t === "(") {
      ops.push(t);
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") output.push(ops.pop()!);
      if (!ops.length) return null;
      ops.pop();
    } else {
      const prev = tokens[k - 1];
      const prevIsValue = typeof prev === "number" || prev === ")";
      // a "-" or "+" with no value before it is a sign: fold in a leading 0
      if ((t === "-" || t === "+") && !prevIsValue) output.push(0);
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        prec[ops[ops.length - 1]] >= prec[t]
      ) {
        output.push(ops.pop()!);
      }
      ops.push(t);
    }
  }
  while (ops.length) {
    const o = ops.pop()!;
    if (o === "(") return null;
    output.push(o);
  }

  const stack: number[] = [];
  for (const t of output) {
    if (typeof t === "number") {
      stack.push(t);
      continue;
    }
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) return null;
    if (t === "/" && b === 0) return null;
    stack.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : a / b);
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) return null;
  return stack[0];
}

/** major units -> the typed editor string, e.g. 18500 -> "18.500" */
export function majorToTyped(major: number): string {
  return minorToTyped(Math.round(major * MINOR));
}

/** stored minor units -> the string to seed the editor with */
export function minorToTyped(minor: number): string {
  const negative = minor < 0;
  const abs = BigInt(Math.abs(Math.round(minor)));
  const intPart = abs / BigInt(MINOR);
  const decPart = abs % BigInt(MINOR);
  const base = decPart === 0n ? String(intPart) : `${intPart},${String(decPart).padStart(2, "0")}`;
  return (negative ? "-" : "") + base;
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
