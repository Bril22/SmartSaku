"use client";

import { useState } from "react";

/**
 * A card that shows a read-only summary by default. Tapping it reveals the
 * edit controls (name, amount, save, delete) passed as children, so cards
 * are calm until the user actually wants to change one.
 */
export default function EditableCard({
  summary,
  children,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border border-line rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left px-3.5 py-3 flex items-center gap-2"
      >
        <span className="flex-1 min-w-0">{summary}</span>
        <span className={`text-inksoft text-xs shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && <div className="px-3.5 pb-3.5 border-t border-line pt-3">{children}</div>}
    </div>
  );
}
