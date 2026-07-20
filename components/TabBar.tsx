"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const tabs = [
  { href: "/", label: "Home", icon: "/brand/icon-home.png" },
  { href: "/money", label: "Money", icon: "/brand/icon-money.png" },
  { href: "/debts", label: "Debts", icon: "/brand/icon-debt-rate.png" },
  { href: "/future", label: "Future", icon: "/brand/icon-future.png" },
];

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export default function TabBar() {
  const pathname = usePathname();
  // optimistic highlight: light up the tapped tab immediately, before navigation finishes
  const [clicked, setClicked] = useState<string | null>(null);
  useEffect(() => setClicked(null), [pathname]);

  const isActive = (href: string) => {
    if (clicked) return clicked === href;
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  };

  return (
    <>
      {/* mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 place-items-center pt-2 pb-2.5">
          {tabs.slice(0, 2).map((t) => (
            <TabLink key={t.href} {...t} active={isActive(t.href)} onNav={() => setClicked(t.href)} />
          ))}
          <div className="relative w-full h-full">
            <Link
              href="/add"
              aria-label="Quick add"
              onClick={() => setClicked("/add")}
              className="absolute left-1/2 -translate-x-1/2 -top-8 rounded-full bg-peachdeep text-white flex items-center justify-center shadow-[0_6px_16px_rgba(201,111,74,.4)]"
              style={{ width: 52, height: 52 }}
            >
              <PlusIcon />
            </Link>
          </div>
          {tabs.slice(2).map((t) => (
            <TabLink key={t.href} {...t} active={isActive(t.href)} onNav={() => setClicked(t.href)} />
          ))}
        </div>
      </nav>

      {/* desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-card border-r border-line p-5 gap-1 z-40">
        <div className="font-display text-2xl font-bold mb-6 px-2">SmartSaku</div>
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            onClick={() => setClicked(t.href)}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold ${
              isActive(t.href) ? "bg-goodbg text-sagedeep" : "text-inksoft hover:bg-cream2"
            }`}
          >
            <Image src={t.icon} alt="" width={22} height={22} className="rounded-md" /> {t.label}
          </Link>
        ))}
        <Link
          href="/add"
          onClick={() => setClicked("/add")}
          className={`mt-4 rounded-full text-center font-bold py-2.5 text-sm inline-flex items-center justify-center gap-1.5 ${
            isActive("/add") ? "bg-ink text-cream2" : "bg-peachdeep text-white"
          }`}
        >
          <PlusIcon /> Quick add
        </Link>
      </aside>
    </>
  );
}

function TabLink({
  href,
  label,
  icon,
  active,
  onNav,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  onNav: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNav}
      className={`flex flex-col items-center gap-0.5 w-14 pt-1 pb-0.5 rounded-xl text-[10px] font-semibold ${
        active ? "text-sagedeep bg-goodbg" : "text-inksoft"
      }`}
    >
      <Image src={icon} alt="" width={24} height={24} className="rounded-md" />
      {label}
    </Link>
  );
}
