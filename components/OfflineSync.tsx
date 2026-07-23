"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { allTx, countTx, removeTx } from "@/lib/txQueue";

export default function OfflineSync() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setCount(await countTx());
      return;
    }
    flushing.current = true;
    try {
      const items = await allTx();
      let synced = 0;
      for (const item of items) {
        try {
          const res = await fetch("/api/tx", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(item),
          });
          if (res.ok) {
            await removeTx(item.clientId);
            synced++;
          } else if (res.status === 401) {
            // signed out — keep everything queued and stop
            break;
          }
          // other errors: leave the item queued and try the next one
        } catch {
          // network dropped mid-flush — stop and retry later
          break;
        }
      }
      setCount(await countTx());
      if (synced > 0) router.refresh();
    } finally {
      flushing.current = false;
    }
  }, [router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    countTx().then(setCount);
    flush();

    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    const onQueued = () => {
      countTx().then(setCount);
      flush();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("smartsaku:queued", onQueued);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("smartsaku:queued", onQueued);
    };
  }, [flush]);

  if (count < 1) return null;

  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="rounded-full bg-ink text-cream2 text-[12px] font-bold px-4 py-2 shadow-[0_8px_24px_rgba(68,58,40,.3)]">
        ☁️ {count} saved offline · {online ? "syncing…" : "will sync when online"}
      </div>
    </div>
  );
}
