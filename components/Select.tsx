"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string; icon?: string };

type Anchor = { top: number; left: number; width: number; openUp: boolean };

export default function Select({
  name,
  options,
  defaultValue,
  placeholder = "Choose…",
  required,
  label,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const [mounted, setMounted] = useState(false);
  const [isSheet, setIsSheet] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const sheet = window.matchMedia("(max-width: 639px)").matches;
      setIsSheet(sheet);
      if (sheet || !triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const listHeight = Math.min(280, options.length * 44 + 12);
      const openUp = window.innerHeight - r.bottom < listHeight + 12 && r.top > listHeight;
      setAnchor({
        top: openUp ? r.top - listHeight - 6 : r.bottom + 6,
        left: Math.min(r.left, window.innerWidth - r.width - 8),
        width: r.width,
        openUp,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, options.length]);

  const choose = (v: string) => {
    setValue(v);
    setOpen(false);
  };

  const list = (
    <ul
      role="listbox"
      className={
        isSheet
          ? "fixed inset-x-0 bottom-0 z-[70] max-h-[65vh] overflow-y-auto overscroll-contain bg-card rounded-t-2xl pt-2 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(68,58,40,.25)]"
          : "fixed z-[70] max-h-[280px] overflow-y-auto overscroll-contain bg-card border border-line rounded-md py-1 shadow-[0_10px_30px_rgba(68,58,40,.22)]"
      }
      style={
        isSheet || !anchor
          ? undefined
          : { top: anchor.top, left: anchor.left, width: anchor.width }
      }
    >
      {isSheet && (
        <li className="px-4 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wide text-inksoft">
          {label ?? placeholder}
        </li>
      )}
      {options.map((o) => (
        <li
          key={o.value}
          role="option"
          aria-selected={o.value === value}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            choose(o.value);
          }}
          className={`flex items-center gap-2.5 cursor-pointer ${
            isSheet ? "px-4 py-3.5 text-[15px] min-h-[48px]" : "px-3.5 py-2.5 text-sm"
          } ${o.value === value ? "font-bold text-sagedeep bg-goodbg/60" : ""}`}
        >
          {o.icon && <span className="text-base leading-none">{o.icon}</span>}
          <span className="flex-1 truncate">{o.label}</span>
          {o.value === value && <span className="text-sagedeep">✓</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} required={required} />
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-md border border-line bg-card px-3.5 py-3 text-sm text-left flex items-center gap-2.5 focus:outline-none focus:border-sagedeep"
      >
        {selected?.icon && <span className="text-base leading-none">{selected.icon}</span>}
        <span className={`flex-1 truncate ${selected ? "" : "text-inksoft"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="#6F6350" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div data-select-portal="true">
            <div
              className="fixed inset-0 z-[60] bg-ink/10"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }}
            />
            {list}
          </div>,
          document.body,
        )}
    </div>
  );
}
