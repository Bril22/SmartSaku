"use client";

import { useEffect, useRef, useState } from "react";
import { reorderAccounts } from "@/app/actions";

export type OrderItem = {
  id: string;
  name: string;
  icon: string;
  balance: string;
  hidden: boolean;
  primary: boolean;
};

const ROW = 60;

export default function AccountOrder({ items }: { items: OrderItem[] }) {
  const [list, setList] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dirty, setDirty] = useState(false);
  const startY = useRef(0);
  const startIndex = useRef(0);
  const listRef = useRef(list);
  listRef.current = list;

  useEffect(() => {
    setList(items);
    setDirty(false);
  }, [items]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= listRef.current.length || from === to) return;
    const next = [...listRef.current];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setList(next);
    setDirty(true);
  };

  const onDown = (e: React.PointerEvent, id: string, index: number) => {
    e.preventDefault();
    setDragId(id);
    setDragY(0);
    startY.current = e.clientY;
    startIndex.current = index;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // capture is a nicety; the drag still works without it
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const dy = e.clientY - startY.current;
    setDragY(dy);
    const current = listRef.current.findIndex((r) => r.id === dragId);
    const target = startIndex.current + Math.round(dy / ROW);
    if (target !== current) move(current, Math.max(0, Math.min(list.length - 1, target)));
  };

  const onUp = () => {
    setDragId(null);
    setDragY(0);
  };

  return (
    <div>
      <ul className="space-y-1.5 select-none">
        {list.map((a, i) => (
          <li
            key={a.id}
            style={
              dragId === a.id
                ? { transform: `translateY(${dragY % ROW}px)`, zIndex: 10, position: "relative" }
                : undefined
            }
            className={`bg-card border rounded-md px-2.5 py-2.5 flex items-center gap-2 ${
              dragId === a.id ? "border-sagedeep shadow-[0_6px_18px_rgba(68,58,40,.18)]" : "border-line"
            }`}
          >
            <span
              onPointerDown={(e) => onDown(e, a.id, i)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              aria-label={`Drag ${a.name}`}
              className="touch-none cursor-grab active:cursor-grabbing text-inksoft px-1.5 py-1 text-base leading-none"
            >
              ⠿
            </span>
            <span className="text-base">{a.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13px] truncate flex items-center gap-1.5">
                {a.name}
                {a.primary && (
                  <span className="text-[9px] font-extrabold text-sagedeep bg-goodbg rounded-full px-1.5 py-0.5">
                    MAIN
                  </span>
                )}
                {a.hidden && (
                  <span className="text-[9px] font-extrabold text-inksoft bg-cream2 rounded-full px-1.5 py-0.5">
                    HIDDEN
                  </span>
                )}
              </div>
              <div className="text-[11px] text-inksoft money">{a.balance}</div>
            </div>
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                type="button"
                aria-label={`Move ${a.name} up`}
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                className="w-7 h-6 rounded border border-line text-inksoft text-[10px] disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`Move ${a.name} down`}
                disabled={i === list.length - 1}
                onClick={() => move(i, i + 1)}
                className="w-7 h-6 rounded border border-line text-inksoft text-[10px] disabled:opacity-30"
              >
                ▼
              </button>
            </div>
          </li>
        ))}
      </ul>

      {dirty && (
        <form action={reorderAccounts} className="mt-2.5 flex items-center gap-2">
          <input type="hidden" name="order" value={list.map((a) => a.id).join(",")} />
          <button className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5">
            Save order
          </button>
          <button
            type="button"
            onClick={() => {
              setList(items);
              setDirty(false);
            }}
            className="text-[11.5px] font-extrabold text-inksoft"
          >
            Reset
          </button>
        </form>
      )}
    </div>
  );
}
