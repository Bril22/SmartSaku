"use client";

import { useState } from "react";

function format(raw: string): string {
  if (!raw) return "";
  const negative = raw.startsWith("-");
  const [intPart, decPart] = raw.replace("-", "").split(".");
  const grouped = intPart ? Number(intPart).toLocaleString("en-US") : "";
  let out = (negative ? "-" : "") + grouped;
  if (raw.includes(".")) out += "." + (decPart ?? "");
  return out;
}

function parse(display: string, allowNegative: boolean): string {
  let raw = display.replace(/[^0-9.-]/g, "");
  if (!allowNegative) raw = raw.replace(/-/g, "");
  else raw = raw.replace(/(?!^)-/g, "");
  const firstDot = raw.indexOf(".");
  if (firstDot !== -1) {
    raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
  }
  return raw;
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
  defaultValue?: number;
  placeholder?: string;
  required?: boolean;
  allowNegative?: boolean;
  className?: string;
}) {
  const [raw, setRaw] = useState(
    defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : "",
  );

  return (
    <>
      <input type="hidden" name={name} value={raw} />
      <input
        type="text"
        inputMode={allowNegative ? "text" : "decimal"}
        autoComplete="off"
        placeholder={placeholder}
        required={required}
        value={format(raw)}
        onChange={(e) => setRaw(parse(e.target.value, allowNegative))}
        className={className}
      />
    </>
  );
}
