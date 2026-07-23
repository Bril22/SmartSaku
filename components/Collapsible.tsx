"use client";

import { useState } from "react";

/** A plain show/hide toggle with a chevron. */
export default function Collapsible({
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
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between rounded-full border border-line bg-card px-4 py-2.5 text-xs font-extrabold text-sagedeep"
      >
        {label}
        <span className={`text-inksoft transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
