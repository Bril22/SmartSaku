"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = { value: string; label: string; icon?: string };

type Anchor = { top: number; left: number; width: number };

export default function Select({
  name,
  options,
  defaultValue,
  value: controlledValue,
  onChange,
  placeholder = "Choose…",
  required,
  label,
}: {
  name: string;
  options: SelectOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const value = controlledValue ?? uncontrolled;
  const [mounted, setMounted] = useState(false);
  const [isSheet, setIsSheet] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragStart = useRef<number | null>(null);
  const dragDelta = useRef(0);
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
      const width = Math.min(r.width, window.innerWidth - 16);
      setAnchor({
        top: Math.max(8, openUp ? r.top - listHeight - 6 : r.bottom + 6),
        left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
        width,
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

  const close = () => {
    setOpen(false);
    setExpanded(false);
    setDragY(0);
  };

  const choose = (v: string) => {
    if (controlledValue === undefined) setUncontrolled(v);
    onChange?.(v);
    close();
  };

  // drag the grabber: up = full screen, down = collapse or dismiss
  const onHandleDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientY;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // pointer capture is a nicety; dragging still works without it
    }
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    dragDelta.current = e.clientY - dragStart.current;
    setDragY(dragDelta.current);
  };
  const onHandleUp = () => {
    const dy = dragDelta.current;
    dragStart.current = null;
    dragDelta.current = 0;
    setDragY(0);
    if (dy < -40) setExpanded(true);
    else if (dy > 60) {
      if (expanded) setExpanded(false);
      else close();
    }
  };

  const sheetStyle: React.CSSProperties = {
    transform: dragY !== 0 ? `translateY(${Math.max(dragY, -20)}px)` : undefined,
    transition: dragStart.current === null ? "transform .2s ease-out, max-height .25s ease-out" : "none",
  };

  const list = (
    <div
      className={
        isSheet
          ? `fixed inset-x-0 bottom-0 z-[70] flex flex-col bg-card rounded-t-2xl shadow-[0_-8px_30px_rgba(68,58,40,.25)] ${
              expanded ? "top-0 rounded-t-none" : "max-h-[65vh]"
            }`
          : "fixed z-[70] max-h-[280px] overflow-y-auto overscroll-contain bg-card border border-line rounded-md py-1 shadow-[0_10px_30px_rgba(68,58,40,.22)]"
      }
      style={
        isSheet
          ? sheetStyle
          : anchor
            ? { top: anchor.top, left: anchor.left, width: anchor.width }
            : undefined
      }
    >
      {isSheet && (
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="shrink-0 pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="mx-auto h-1.5 w-11 rounded-full bg-line" />
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-inksoft">
              {label ?? placeholder}
            </span>
            <button
              type="button"
              onClick={close}
              className="text-[11px] font-extrabold text-sagedeep px-2 py-1"
            >
              Close
            </button>
          </div>
        </div>
      )}
      <ul
        role="listbox"
        className={
          isSheet
            ? "flex-1 overflow-y-auto overscroll-contain pb-[calc(12px+env(safe-area-inset-bottom))]"
            : ""
        }
      >
        {options.map((o) => (
          <li
            key={o.value}
            role="option"
            aria-selected={o.value === value}
            onClick={() => choose(o.value)}
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
    </div>
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
            <div className="fixed inset-0 z-[60] bg-ink/20" onClick={close} />
            {list}
          </div>,
          document.body,
        )}
    </div>
  );
}
