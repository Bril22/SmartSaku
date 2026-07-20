"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/money", label: "Money", icon: "💳" },
  { href: "/debts", label: "Debts", icon: "📉" },
  { href: "/future", label: "Future", icon: "🌱" },
];

export default function TabBar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="relative flex justify-around items-end px-1 pt-2 pb-2.5">
          <Link
            href="/add"
            aria-label="Quick add"
            className="absolute left-1/2 -translate-x-1/2 -top-6 w-13 h-13 rounded-full bg-peachdeep text-white flex items-center justify-center text-2xl font-bold shadow-[0_6px_16px_rgba(201,111,74,.4)]"
            style={{ width: 52, height: 52 }}
          >
            +
          </Link>
          {tabs.slice(0, 2).map((t) => (
            <TabLink key={t.href} {...t} active={isActive(t.href)} />
          ))}
          <div className="w-13" style={{ width: 52 }} />
          {tabs.slice(2).map((t) => (
            <TabLink key={t.href} {...t} active={isActive(t.href)} />
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
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
              isActive(t.href) ? "bg-goodbg text-sagedeep" : "text-inksoft hover:bg-cream2"
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </Link>
        ))}
        <Link
          href="/add"
          className="mt-4 rounded-full bg-peachdeep text-white text-center font-bold py-2.5 text-sm"
        >
          + Quick add
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
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 w-14 text-[10px] font-semibold ${
        active ? "text-sagedeep" : "text-inksoft"
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </Link>
  );
}
