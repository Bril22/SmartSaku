"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  const [flipUp, setFlipUp] = useState(false);
  const [offset, setOffset] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      // composedPath is captured at dispatch, so it still works when an inner
      // component (e.g. a Select option) removes the clicked node on this event
      const path = e.composedPath();
      if (ref.current && path.includes(ref.current)) return;
      // dropdowns render in a portal on document.body but belong to this popover
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

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!panelRef.current || !ref.current) return;
      const panel = panelRef.current.getBoundingClientRect();
      const anchor = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - anchor.bottom;
      const spaceAbove = anchor.top;
      setFlipUp(spaceBelow < panel.height + 16 && spaceAbove > spaceBelow);
      const maxLeft = Math.max(8, window.innerWidth - panel.width - 8);
      const wanted = Math.min(Math.max(anchor.right - panel.width, 8), maxLeft);
      setOffset(wanted - anchor.left);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={triggerClass}>
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          className={`absolute z-30 ${width} max-w-[calc(100vw-16px)] max-h-[min(70vh,420px)] overflow-y-auto overscroll-contain bg-card border border-line rounded-md p-3 shadow-[0_10px_30px_rgba(68,58,40,.18)] space-y-2 ${
            flipUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } ${offset === null ? "right-0" : ""}`}
          style={offset === null ? undefined : { left: offset }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
