"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const CONFETTI_COLORS = ["#31694E", "#BBC863", "#F0E491", "#E8A07C", "#C96F4A"];

export default function Toaster() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [fx, setFx] = useState<string | null>(null);

  useEffect(() => {
    const ok = searchParams.get("ok");
    const fxParam = searchParams.get("fx");
    if (!ok && !fxParam) return;
    setToast(ok);
    setFx(fxParam);

    // strip ok/fx from the URL, keep other params (e.g. ?years=10)
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("ok");
    rest.delete("fx");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname, { scroll: false });

    const t1 = setTimeout(() => setToast(null), 3000);
    const t2 = setTimeout(() => setFx(null), 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <>
      {toast && <div className="toast">{toast}</div>}

      {fx === "lunas" && (
        <>
          <div className="fx-layer">
            {Array.from({ length: 36 }).map((_, i) => (
              <span
                key={i}
                className="confetti"
                style={{
                  left: `${(i * 29) % 100}%`,
                  animationDelay: `${(i % 12) * 0.09}s`,
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                }}
              />
            ))}
          </div>
          <div className="lunas-banner">Lunas! 🎉</div>
        </>
      )}

      {fx === "paid" && (
        <div className="fx-layer">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="confetti"
              style={{
                left: `${(i * 41 + 15) % 100}%`,
                animationDelay: `${(i % 7) * 0.07}s`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              }}
            />
          ))}
        </div>
      )}

      {fx === "money" && (
        <div className="fx-layer">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className="coin"
              style={{ left: `${(i * 23 + 8) % 88}%`, animationDelay: `${(i % 5) * 0.14}s` }}
            >
              {["💰", "🪙", "💸"][i % 3]}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
