"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Pos = { top: number; left: number; maxH: number };

export default function Popover({
  trigger,
  triggerClass,
  children,
  width = "w-60",
}: {
  trigger: React.ReactNode;
  triggerClass?: string;
  children: React.ReactNode;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      // composedPath is captured at dispatch, so it still works when an inner
      // component (e.g. a Select option) removes the clicked node on this event
      const path = e.composedPath();
      if (ref.current && path.includes(ref.current)) return;
      // the panel and any nested dropdowns live in a portal marked like this
      const inPortal = path.some(
        (n) => n instanceof HTMLElement && n.dataset.selectPortal === "true",
      );
      if (inPortal) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // fixed positioning off the trigger rect, so no ancestor overflow can clip it
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!panelRef.current || !ref.current) return;
      const anchor = ref.current.getBoundingClientRect();
      const panel = panelRef.current.getBoundingClientRect();
      const gap = 6;
      const margin = 8;
      const below = window.innerHeight - anchor.bottom - gap - margin;
      const above = anchor.top - gap - margin;
      let top: number;
      let maxH: number;
      if (panel.height <= below || below >= above) {
        top = anchor.bottom + gap;
        maxH = below;
      } else {
        top = Math.max(margin, anchor.top - gap - Math.min(panel.height, above));
        maxH = above;
      }
      // right-align to the trigger, then clamp inside the viewport
      const left = Math.min(
        Math.max(margin, anchor.right - panel.width),
        Math.max(margin, window.innerWidth - panel.width - margin),
      );
      setPos({ top, left, maxH: Math.max(140, maxH) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} className={triggerClass}>
        {trigger}
      </button>
      {mounted &&
        open &&
        createPortal(
          <div data-select-portal="true">
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              ref={panelRef}
              className={`fixed z-[70] ${width} max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain bg-card border border-line rounded-lg p-3 shadow-[0_10px_30px_rgba(68,58,40,.22)] space-y-2`}
              style={
                pos
                  ? { top: pos.top, left: pos.left, maxHeight: pos.maxH }
                  : { visibility: "hidden", top: 0, left: 0 }
              }
            >
              {children}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
