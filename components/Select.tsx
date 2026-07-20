"use client";

import { useEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string; icon?: string };

export default function Select({
  name,
  options,
  defaultValue,
  placeholder = "Choose…",
  required,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  useEffect(() => {
    if (open && highlight >= 0) {
      listRef.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, highlight]);

  const choose = (v: string) => {
    setValue(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return setOpen(false);
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      if (!open) return setOpen(true);
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + dir + options.length) % options.length);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) return setOpen(true);
      if (highlight >= 0) choose(options[highlight].value);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} required={required} />
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="w-full rounded-md border border-line bg-card px-3.5 py-3 text-sm text-left flex items-center gap-2.5 focus:outline-none focus:border-sagedeep"
      >
        {selected?.icon && <span className="text-base leading-none">{selected.icon}</span>}
        <span className={`flex-1 truncate ${selected ? "" : "text-inksoft"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="#6F6350" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1.5 w-full max-h-60 overflow-auto rounded-md border border-line bg-card shadow-[0_10px_30px_rgba(68,58,40,.18)] py-1"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onPointerDown={(e) => {
                e.preventDefault();
                choose(o.value);
              }}
              onPointerEnter={() => setHighlight(i)}
              className={`px-3.5 py-2.5 text-sm flex items-center gap-2.5 cursor-pointer ${
                i === highlight ? "bg-cream2" : ""
              } ${o.value === value ? "font-bold text-sagedeep" : ""}`}
            >
              {o.icon && <span className="text-base leading-none">{o.icon}</span>}
              <span className="flex-1 truncate">{o.label}</span>
              {o.value === value && <span className="text-sagedeep">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
