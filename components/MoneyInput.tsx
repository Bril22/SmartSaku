"use client";

import { useState } from "react";

const MINOR = 100;

/** what the user is typing, e.g. "1234567,8" -> "1.234.567,8" */
function display(raw: string): string {
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
function normalise(text: string, allowNegative: boolean): string {
  let raw = text.replace(/[^0-9,-]/g, "");
  raw = allowNegative ? raw.replace(/(?!^)-/g, "") : raw.replace(/-/g, "");
  const negative = raw.startsWith("-");
  const body = raw.replace(/-/g, "");
  const [intPart, ...rest] = body.split(",");
  let out = intPart.replace(/^0+(?=\d)/, "");
  if (rest.length) out += "," + rest.join("").slice(0, 2);
  return (negative ? "-" : "") + out;
}

function toMinor(raw: string): string {
  if (!raw || raw === "-") return "";
  const negative = raw.startsWith("-");
  const [intPart = "", decPart = ""] = raw.replace("-", "").split(",");
  const minor =
    BigInt(intPart || "0") * BigInt(MINOR) + BigInt(decPart.padEnd(2, "0").slice(0, 2) || "0");
  return String(negative ? -minor : minor);
}

function fromMinor(minor: number): string {
  const negative = minor < 0;
  const abs = BigInt(Math.abs(Math.round(minor)));
  const intPart = abs / BigInt(MINOR);
  const decPart = abs % BigInt(MINOR);
  const base = decPart === 0n ? String(intPart) : `${intPart},${String(decPart).padStart(2, "0")}`;
  return (negative ? "-" : "") + base;
}

export default function MoneyInput({
  name,
  defaultValue,
  placeholder,
  required,
  allowNegative = false,
  className,
}: {
  name: string;
  /** minor units, matching what is stored */
  defaultValue?: number;
  placeholder?: string;
  required?: boolean;
  allowNegative?: boolean;
  className?: string;
}) {
  const [raw, setRaw] = useState(
    defaultValue !== undefined && defaultValue !== null ? fromMinor(defaultValue) : "",
  );

  return (
    <>
      <input type="hidden" name={name} value={toMinor(raw)} />
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        required={required}
        value={display(raw)}
        onChange={(e) => setRaw(normalise(e.target.value, allowNegative))}
        className={className}
      />
    </>
  );
}
