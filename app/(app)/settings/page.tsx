import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { CURRENCIES } from "@/lib/money";
import { logout } from "@/app/actions";
import {
  changePassword,
  deleteMyAccount,
  updateCurrency,
  updateMonthStart,
  updateProfileName,
} from "@/app/settings/actions";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.settings.findUnique({ where: { userId } }),
  ]);

  return (
    <div className="max-w-md">
      <h1 className="font-display text-2xl font-semibold mb-5">Settings</h1>

      <div className="bg-card border border-line rounded-lg p-4 mb-4 flex items-center gap-4">
        <Image src="/brand/mascot-abacus.png" alt="Saku-Kun" width={64} height={64} />
        <form action={updateProfileName} className="flex-1 flex items-center gap-2">
          <div className="flex-1">
            <input
              name="name"
              defaultValue={user?.name}
              maxLength={40}
              className="w-full font-bold text-[15px] bg-transparent border-b border-transparent focus:border-line focus:outline-none"
            />
            <div className="text-sm text-inksoft">{user?.email}</div>
          </div>
          <SubmitButton className="text-[11px] font-extrabold text-sagedeep" pendingText="…">
            Save
          </SubmitButton>
        </form>
      </div>

      <h2 className="text-sm font-bold mb-2">Display currency</h2>
      <form action={updateCurrency} className="bg-card border border-line rounded-lg p-4 mb-4 space-y-3">
        <Select
          name="currency"
          defaultValue={settings?.currency ?? "IDR"}
          options={Object.entries(CURRENCIES).map(([code, c]) => ({
            value: code,
            label: `${code} — ${c.label}`,
            icon: c.symbol,
          }))}
        />
        <p className="text-[11.5px] text-inksoft">
          Amounts are stored in IDR and converted for display using daily exchange rates.
        </p>
        <SubmitButton
          className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
          pendingText="Saving…"
        >
          Apply currency
        </SubmitButton>
      </form>

      <h2 className="text-sm font-bold mb-2">Budget month</h2>
      <form
        action={updateMonthStart}
        className="bg-card border border-line rounded-lg p-4 mb-4 space-y-3"
      >
        <div className="flex items-center gap-3">
          <label htmlFor="monthStartDay" className="text-sm flex-1">
            Start my month on day
          </label>
          <input
            id="monthStartDay"
            name="monthStartDay"
            type="number"
            min={1}
            max={28}
            defaultValue={settings?.monthStartDay ?? 1}
            className="w-20 text-center rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
          />
        </div>
        <p className="text-[11.5px] text-inksoft">
          Set this to your payday (for example 25) so the totals on your home screen follow your
          salary cycle. Day 1 is the plain calendar month. Your history calendar and debts stay on
          calendar months.
        </p>
        <SubmitButton
          className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
          pendingText="Saving…"
        >
          Apply
        </SubmitButton>
      </form>

      <div className="bg-card border border-line rounded-lg divide-y divide-line mb-4">
        <Link href="/settings/spaces" className="px-4 py-3.5 flex items-center gap-3">
          <span className="text-lg">👥</span>
          <div className="flex-1">
            <div className="font-semibold text-[13.5px]">Spaces & sharing</div>
            <div className="text-[11.5px] text-inksoft">Track money together with someone</div>
          </div>
          <span className="text-inksoft">›</span>
        </Link>
        <Link href="/settings/accounts" className="px-4 py-3.5 flex items-center gap-3">
          <span className="text-lg">🏦</span>
          <span className="flex-1 font-semibold text-[13.5px]">Manage accounts</span>
          <span className="text-inksoft">›</span>
        </Link>
        <Link href="/settings/categories" className="px-4 py-3.5 flex items-center gap-3">
          <span className="text-lg">🏷️</span>
          <span className="flex-1 font-semibold text-[13.5px]">Manage categories</span>
          <span className="text-inksoft">›</span>
        </Link>
        <Link href="/settings/templates" className="px-4 py-3.5 flex items-center gap-3">
          <span className="text-lg">⭐</span>
          <div className="flex-1">
            <div className="font-semibold text-[13.5px]">Quick templates</div>
            <div className="text-[11.5px] text-inksoft">One-tap entries for what you log often</div>
          </div>
          <span className="text-inksoft">›</span>
        </Link>
        <a href="/api/export" className="px-4 py-3.5 flex items-center gap-3">
          <span className="text-lg">📤</span>
          <div className="flex-1">
            <div className="font-semibold text-[13.5px]">Export transactions (CSV)</div>
            <div className="text-[11.5px] text-inksoft">Opens in Excel or Google Sheets</div>
          </div>
          <span className="text-inksoft">↓</span>
        </a>
      </div>

      <details className="bg-card border border-line rounded-lg p-4 mb-4">
        <summary className="text-sm font-bold cursor-pointer">🔒 Change password</summary>
        <form action={changePassword} className="mt-3 space-y-2.5">
          <input
            name="current"
            type="password"
            required
            placeholder="Current password"
            autoComplete="current-password"
            className="w-full rounded-md border border-line bg-cream2 px-3.5 py-2.5 text-sm"
          />
          <input
            name="next"
            type="password"
            required
            minLength={8}
            placeholder="New password (min 8 characters)"
            autoComplete="new-password"
            className="w-full rounded-md border border-line bg-cream2 px-3.5 py-2.5 text-sm"
          />
          <input
            name="confirm"
            type="password"
            required
            minLength={8}
            placeholder="Repeat new password"
            autoComplete="new-password"
            className="w-full rounded-md border border-line bg-cream2 px-3.5 py-2.5 text-sm"
          />
          <SubmitButton
            className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
            pendingText="Changing…"
          >
            Change password
          </SubmitButton>
        </form>
      </details>

      <form action={logout} className="mb-4">
        <button className="w-full rounded-full border-2 border-earth text-earth font-bold py-3 text-sm">
          Sign out
        </button>
      </form>

      <details className="bg-badbg border border-bad/30 rounded-lg p-4">
        <summary className="text-sm font-bold text-bad cursor-pointer">⚠️ Delete account</summary>
        <form action={deleteMyAccount} className="mt-3 space-y-2.5">
          <p className="text-[12.5px] text-bad">
            This permanently deletes your account and ALL data (accounts, transactions, debts,
            history). This cannot be undone. Type your email to confirm.
          </p>
          <input
            name="confirmEmail"
            type="email"
            required
            placeholder={user?.email}
            className="w-full rounded-md border border-bad/40 bg-card px-3.5 py-2.5 text-sm"
          />
          <SubmitButton
            className="rounded-full bg-bad text-white text-xs font-extrabold px-5 py-2.5"
            pendingText="Deleting…"
          >
            Delete my account forever
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
