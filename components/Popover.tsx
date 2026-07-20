"use client";

import { useEffect, useRef, useState } from "react";

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
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

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={triggerClass}>
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute right-0 z-30 mt-1.5 ${width} bg-card border border-line rounded-md p-3 shadow-[0_10px_30px_rgba(68,58,40,.18)] space-y-2`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
