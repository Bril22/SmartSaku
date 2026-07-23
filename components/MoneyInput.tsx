"use client";

import { useState } from "react";
import {
  evalMoneyExpr,
  hasMathOperator,
  majorToTyped,
  minorToTyped,
  normaliseTyped,
  typedDisplay,
  typedToMinor,
  MINOR,
} from "@/lib/format";

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
  const [text, setText] = useState(
    defaultValue !== undefined && defaultValue !== null ? minorToTyped(defaultValue) : "",
  );

  const isMath = hasMathOperator(text);
  const result = isMath ? evalMoneyExpr(text) : null;
  const display = isMath ? text : typedDisplay(text);
  const hidden =
    isMath && result !== null ? String(Math.round(result * MINOR)) : typedToMinor(text);

  const collapse = () => {
    if (result !== null) setText(majorToTyped(result));
  };

  const onChange = (v: string) => {
    setText(hasMathOperator(v) ? v.replace(/[^0-9.,+\-*/() ]/g, "") : normaliseTyped(v, allowNegative));
  };

  return (
    <div className="relative w-full">
      <input type="hidden" name={name} value={hidden} />
      <input
        type="text"
        inputMode={isMath ? "text" : "decimal"}
        autoComplete="off"
        placeholder={placeholder}
        required={required}
        value={display}
        onChange={(e) => onChange(e.target.value)}
        onBlur={collapse}
        onKeyDown={(e) => {
          if (e.key === "Enter" && isMath) {
            e.preventDefault();
            collapse();
          }
        }}
        className={className}
        style={result !== null ? { paddingRight: "3.25rem" } : undefined}
      />
      {result !== null && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={collapse}
          title="Calculate"
          aria-label="Calculate"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-sagedeep text-cream2 px-2.5 py-1 text-xs font-extrabold leading-none"
        >
          =
        </button>
      )}
    </div>
  );
}
