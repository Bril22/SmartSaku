"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Mode = "date" | "month" | "datetime";
type Anchor = { top: number; left: number; maxH: number };

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const PANEL_W = 300;
const PANEL_H = 350;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parse(value: string, mode: Mode) {
  if (mode === "month") {
    const m = value.match(/^(\d{4})-(\d{2})$/);
    return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: 1, hh: 0, mm: 0 } : null;
  }
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  return {
    y: Number(m[1]),
    m: Number(m[2]) - 1,
    d: Number(m[3]),
    hh: m[4] ? Number(m[4]) : 0,
    mm: m[5] ? Number(m[5]) : 0,
  };
}

function format(y: number, m: number, d: number, mode: Mode, hh = 0, mm = 0) {
  if (mode === "month") return `${y}-${pad(m + 1)}`;
  const day = `${y}-${pad(m + 1)}-${pad(d)}`;
  return mode === "datetime" ? `${day}T${pad(hh)}:${pad(mm)}` : day;
}

function label(value: string, mode: Mode, placeholder: string) {
  const p = parse(value, mode);
  if (!p) return placeholder;
  if (mode === "month") return `${MONTHS[p.m]} ${p.y}`;
  const day = `${pad(p.d)} ${MONTHS[p.m]} ${p.y}`;
  return mode === "datetime" ? `${day} · ${pad(p.hh)}:${pad(p.mm)}` : day;
}

export default function DateField({
  name,
  defaultValue = "",
  value: controlledValue,
  onChange,
  mode = "date",
  required,
  placeholder,
  title,
  className = "",
  defaultNow = false,
}: {
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  mode?: Mode;
  required?: boolean;
  placeholder?: string;
  title?: string;
  className?: string;
  /** fill with the viewer's current date/time after mount (never during SSR) */
  defaultNow?: boolean;
}) {
  const ph = placeholder ?? (mode === "month" ? "Pick a month" : "Pick a date");
  const [open, setOpen] = useState(false);
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = controlledValue ?? uncontrolled;
  const [mounted, setMounted] = useState(false);
  const [isSheet, setIsSheet] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [dragY, setDragY] = useState(0);
  const [view, setView] = useState(() => {
    const p = parse(value, mode) ?? parse(defaultValue, mode);
    const now = new Date();
    return { y: p?.y ?? now.getFullYear(), m: p?.m ?? now.getMonth() };
  });
  const [picking, setPicking] = useState<"day" | "month" | "year">(
    mode === "month" ? "month" : "day",
  );
  const [time, setTime] = useState(() => {
    const p = parse(defaultValue, mode);
    const now = new Date();
    return { hh: p?.hh ?? now.getHours(), mm: p?.mm ?? now.getMinutes() };
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const dragDelta = useRef(0);

  useEffect(() => setMounted(true), []);

  // the server clock is not the user's clock, so "now" is decided on the client
  useEffect(() => {
    if (!defaultNow || value || controlledValue !== undefined) return;
    const n = new Date();
    setUncontrolled(format(n.getFullYear(), n.getMonth(), n.getDate(), mode, n.getHours(), n.getMinutes()));
  }, [defaultNow, value, controlledValue, mode]);

  useEffect(() => {
    if (!open) return;
    const p = parse(value, mode);
    if (p) {
      setView({ y: p.y, m: p.m });
      if (mode === "datetime") setTime({ hh: p.hh, mm: p.mm });
    }
    setPicking(mode === "month" ? "month" : "day");
  }, [open, value, mode]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const sheet = window.matchMedia("(max-width: 639px)").matches;
      setIsSheet(sheet);
      if (sheet || !triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const panelH = panelRef.current?.scrollHeight ?? PANEL_H;
      const gap = 6;
      const margin = 8;
      const below = window.innerHeight - r.bottom - gap - margin;
      const above = r.top - gap - margin;
      let top: number;
      let maxH: number;
      if (panelH <= below || below >= above) {
        top = r.bottom + gap;
        maxH = below;
      } else if (panelH <= above) {
        top = r.top - panelH - gap;
        maxH = above;
      } else {
        top = margin;
        maxH = above;
      }
      setAnchor({
        top,
        left: Math.min(Math.max(margin, r.left), window.innerWidth - PANEL_W - margin),
        maxH,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, picking]);

  const close = () => {
    setOpen(false);
    setDragY(0);
  };

  const commit = (v: string) => {
    if (controlledValue === undefined) setUncontrolled(v);
    onChange?.(v);
    close();
  };

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
    setDragY(Math.max(0, dragDelta.current));
  };
  const onHandleUp = () => {
    const dy = dragDelta.current;
    dragStart.current = null;
    dragDelta.current = 0;
    setDragY(0);
    if (dy > 60) close();
  };

  const today = new Date();
  const sel = parse(value, mode);
  const shift = (delta: number) => {
    if (picking === "year") {
      setView((v) => ({ ...v, y: v.y + delta * 12 }));
    } else if (picking === "month" || mode === "month") {
      setView((v) => ({ ...v, y: v.y + delta }));
    } else {
      setView((v) => {
        const m = v.m + delta;
        if (m < 0) return { y: v.y - 1, m: 11 };
        if (m > 11) return { y: v.y + 1, m: 0 };
        return { y: v.y, m };
      });
    }
  };

  const grid = () => {
    const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
    const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
    const cells: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const headingText =
    picking === "year"
      ? `${view.y - 6} – ${view.y + 5}`
      : picking === "month" || mode === "month"
        ? String(view.y)
        : `${MONTHS[view.m]} ${view.y}`;

  const body = (
    <div className={isSheet ? "px-4 pb-[calc(16px+env(safe-area-inset-bottom))]" : "p-3"}>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous"
          className="w-9 h-9 rounded-full flex items-center justify-center text-inksoft hover:bg-cream2 active:bg-cream2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() =>
            setPicking((p) =>
              p === "year" ? (mode === "month" ? "month" : "day") : p === "month" ? "year" : "month",
            )
          }
          className="flex-1 text-center text-[13.5px] font-extrabold text-ink py-1.5 rounded-md hover:bg-cream2"
        >
          {headingText}
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next"
          className="w-9 h-9 rounded-full flex items-center justify-center text-inksoft hover:bg-cream2 active:bg-cream2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {picking === "year" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => view.y - 6 + i).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setView((v) => ({ ...v, y }));
                setPicking(mode === "month" ? "month" : "month");
              }}
              className={`rounded-md py-2.5 text-[13px] font-semibold ${
                sel?.y === y ? "bg-sagedeep text-cream2" : "text-ink hover:bg-cream2"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      ) : picking === "month" || mode === "month" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {MONTHS.map((mn, i) => {
            const isSel = sel?.y === view.y && sel?.m === i;
            const isNow = today.getFullYear() === view.y && today.getMonth() === i;
            return (
              <button
                key={mn}
                type="button"
                onClick={() => {
                  if (mode === "month") commit(format(view.y, i, 1, mode));
                  else {
                    setView((v) => ({ ...v, m: i }));
                    setPicking("day");
                  }
                }}
                className={`rounded-md py-2.5 text-[13px] font-semibold ${
                  isSel
                    ? "bg-sagedeep text-cream2"
                    : isNow
                      ? "text-sagedeep bg-goodbg"
                      : "text-ink hover:bg-cream2"
                }`}
              >
                {mn}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="text-center text-[10.5px] font-bold text-inksoft py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {grid().map((d, i) => {
              if (d === null) return <div key={i} />;
              const isSel = sel?.y === view.y && sel?.m === view.m && sel?.d === d;
              const isNow =
                today.getFullYear() === view.y &&
                today.getMonth() === view.m &&
                today.getDate() === d;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => commit(format(view.y, view.m, d, mode, time.hh, time.mm))}
                  className={`mx-auto flex items-center justify-center rounded-full text-[13px] ${
                    isSheet ? "w-11 h-11" : "w-9 h-9"
                  } ${
                    isSel
                      ? "bg-sagedeep text-cream2 font-extrabold"
                      : isNow
                        ? "bg-goodbg text-sagedeep font-extrabold"
                        : "text-ink hover:bg-cream2"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </>
      )}

      {mode === "datetime" && (
        <div className="flex items-center gap-2 pt-2.5 mt-2 border-t border-line">
          <span className="text-[11px] font-bold text-inksoft flex-1">Time</span>
          <select
            aria-label="Hour"
            value={time.hh}
            onChange={(e) => setTime((t) => ({ ...t, hh: Number(e.target.value) }))}
            className="rounded-md border border-line bg-cream2 px-2 py-1.5 text-sm font-bold"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {pad(h)}
              </option>
            ))}
          </select>
          <span className="font-bold text-inksoft">:</span>
          <select
            aria-label="Minute"
            value={time.mm}
            onChange={(e) => setTime((t) => ({ ...t, mm: Number(e.target.value) }))}
            className="rounded-md border border-line bg-cream2 px-2 py-1.5 text-sm font-bold"
          >
            {Array.from({ length: 60 }, (_, m) => (
              <option key={m} value={m}>
                {pad(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const n = new Date();
              setTime({ hh: n.getHours(), mm: n.getMinutes() });
            }}
            className="text-[11px] font-extrabold text-sagedeep px-1.5"
          >
            Now
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-line">
        <button
          type="button"
          onClick={() => commit("")}
          className="text-[11.5px] font-extrabold text-inksoft px-2 py-1.5"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() =>
            commit(
              format(
                today.getFullYear(),
                today.getMonth(),
                today.getDate(),
                mode,
                time.hh,
                time.mm,
              ),
            )
          }
          className="text-[11.5px] font-extrabold text-sagedeep px-2 py-1.5"
        >
          {mode === "month" ? "This month" : "Today"}
        </button>
      </div>
    </div>
  );

  const panel = (
    <div
      ref={panelRef}
      className={
        isSheet
          ? "fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-2xl shadow-[0_-8px_30px_rgba(68,58,40,.25)] max-h-[85vh] overflow-y-auto overscroll-contain"
          : "fixed z-[70] bg-card border border-line rounded-lg shadow-[0_10px_30px_rgba(68,58,40,.22)] overflow-y-auto overscroll-contain"
      }
      style={
        isSheet
          ? {
              transform: dragY ? `translateY(${dragY}px)` : undefined,
              transition: dragStart.current === null ? "transform .2s ease-out" : "none",
            }
          : anchor
            ? { top: anchor.top, left: anchor.left, width: PANEL_W, maxHeight: anchor.maxH }
            : { visibility: "hidden" }
      }
    >
      {isSheet && (
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="mx-auto h-1.5 w-11 rounded-full bg-line" />
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-inksoft">
              {title ?? ph}
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
      {body}
    </div>
  );

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} required={required} />
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full rounded-md border border-line bg-card px-3.5 py-3 text-sm text-left flex items-center gap-2 focus:outline-none focus:border-sagedeep ${className}`}
      >
        <span className={`flex-1 truncate ${sel ? "" : "text-inksoft"}`}>
          {label(value, mode, ph)}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="3" stroke="#6F6350" strokeWidth="1.8" />
          <path d="M3 10h18M8 3v4M16 3v4" stroke="#6F6350" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {mounted &&
        open &&
        createPortal(
          <div data-select-portal="true">
            <div className="fixed inset-0 z-[60] bg-ink/20" onClick={close} />
            {panel}
          </div>,
          document.body,
        )}
    </div>
  );
}
