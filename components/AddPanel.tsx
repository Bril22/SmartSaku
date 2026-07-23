"use client";

import { useState } from "react";

/**
 * A full-width "+ Add …" button that reveals a form panel below it.
 * Replaces the bottom-of-section add forms with a button at the top.
 */
export default function AddPanel({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`w-full rounded-full text-xs font-extrabold py-3 flex items-center justify-center gap-1.5 ${
          open ? "bg-goodbg text-sagedeep" : "border border-dashed border-sagedeep/50 text-sagedeep"
        }`}
      >
        <span className={`transition-transform ${open ? "rotate-45" : ""}`}>+</span>
        {label}
      </button>
      {open && (
        <div className="mt-2 bg-card border border-line rounded-lg p-3.5">
          {children}
        </div>
      )}
    </div>
  );
}
