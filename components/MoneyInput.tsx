"use client";

import { useState } from "react";
import { minorToTyped, normaliseTyped, typedDisplay, typedToMinor } from "@/lib/format";

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
    defaultValue !== undefined && defaultValue !== null ? minorToTyped(defaultValue) : "",
  );

  return (
    <>
      <input type="hidden" name={name} value={typedToMinor(raw)} />
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        required={required}
        value={typedDisplay(raw)}
        onChange={(e) => setRaw(normaliseTyped(e.target.value, allowNegative))}
        className={className}
      />
    </>
  );
}
