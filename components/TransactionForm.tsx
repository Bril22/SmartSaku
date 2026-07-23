"use client";

import Link from "next/link";
import { useState } from "react";
import MoneyInput from "@/components/MoneyInput";
import Select, { type SelectOption } from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";
import DateField from "@/components/DateField";
import { enqueueTx } from "@/lib/txQueue";

function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export type CategoryOption = SelectOption & { type: "INCOME" | "EXPENSE" };

export type TemplateOption = {
  id: string;
  name: string;
  emoji: string;
  direction: "IN" | "OUT";
  amount: number;
  categoryId: string | null;
  accountId: string | null;
  note: string;
  amountLabel: string;
};

export default function TransactionForm({
  action,
  accounts,
  categories,
  templates = [],
  allowTemplate = false,
  offline = false,
  defaults,
  submitLabel = "Save",
  extraFields,
}: {
  action: (formData: FormData) => void;
  accounts: SelectOption[];
  categories: CategoryOption[];
  templates?: TemplateOption[];
  allowTemplate?: boolean;
  offline?: boolean;
  defaults?: {
    direction?: "IN" | "OUT";
    amount?: number;
    accountId?: string;
    categoryId?: string;
    note?: string;
    date?: string;
  };
  submitLabel?: string;
  extraFields?: React.ReactNode;
}) {
  const [direction, setDirection] = useState<"IN" | "OUT">(defaults?.direction ?? "OUT");
  const [categoryId, setCategoryId] = useState(defaults?.categoryId ?? "");
  const [seed, setSeed] = useState({
    amount: defaults?.amount,
    accountId: defaults?.accountId ?? accounts[0]?.value,
    note: defaults?.note ?? "",
  });
  // bumping this remounts the uncontrolled fields, re-seeding them from a template
  const [formKey, setFormKey] = useState(0);
  const [saveTpl, setSaveTpl] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);

  // when there is no connection, keep the entry in a local queue and let
  // OfflineSync push it to the server later. Online submits are untouched.
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!offline) return;
    if (typeof navigator !== "undefined" && navigator.onLine) return;
    e.preventDefault();
    e.stopPropagation();
    const fd = new FormData(e.currentTarget);
    const amount = String(fd.get("amount") ?? "");
    const accountId = String(fd.get("accountId") ?? "");
    if (!amount || !accountId) return;
    enqueueTx({
      clientId:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      amount,
      direction: fd.get("direction") === "IN" ? "IN" : "OUT",
      accountId,
      categoryId: String(fd.get("categoryId") ?? "") || null,
      note: String(fd.get("note") ?? ""),
      date: String(fd.get("date") ?? "") || localNow(),
      createdAt: Date.now(),
    }).then(() => {
      window.dispatchEvent(new Event("smartsaku:queued"));
      setSavedOffline(true);
      setSeed({ amount: undefined, accountId, note: "" });
      setFormKey((k) => k + 1);
      setTimeout(() => setSavedOffline(false), 5000);
    });
  };

  const wanted = direction === "IN" ? "INCOME" : "EXPENSE";
  const visible = categories.filter((c) => c.type === wanted);
  const options: SelectOption[] = [{ value: "", label: "No category" }, ...visible];

  const switchDirection = (d: "IN" | "OUT") => {
    setDirection(d);
    const stillValid = categories.some(
      (c) => c.value === categoryId && c.type === (d === "IN" ? "INCOME" : "EXPENSE"),
    );
    if (!stillValid) setCategoryId("");
  };

  const applyTemplate = (t: TemplateOption) => {
    setDirection(t.direction);
    setCategoryId(t.categoryId ?? "");
    setSeed({
      amount: t.amount || undefined,
      accountId: t.accountId ?? accounts[0]?.value,
      note: t.note,
    });
    setFormKey((k) => k + 1);
  };

  return (
    <form action={action} onSubmit={handleSubmit} className="space-y-4">
      {extraFields}

      {savedOffline && (
        <div className="rounded-md bg-goodbg text-sagedeep text-[12.5px] font-semibold px-3.5 py-2.5">
          ☁️ Saved offline. It will sync automatically when you are back online.
        </div>
      )}

      {templates.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t)}
              className="shrink-0 flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 hover:border-sagedeep"
            >
              <span className="text-base leading-none">{t.emoji}</span>
              <span className="text-left leading-tight">
                <span className="block text-[12px] font-bold">{t.name}</span>
                <span className="block text-[10.5px] text-inksoft money">{t.amountLabel}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="cursor-pointer">
          <input
            type="radio"
            name="direction"
            value="OUT"
            checked={direction === "OUT"}
            onChange={() => switchDirection("OUT")}
            className="peer sr-only"
          />
          <div className="rounded-md border-2 border-line bg-card py-3 text-center text-sm font-bold peer-checked:border-peachdeep peer-checked:bg-badbg peer-checked:text-peachdeep">
            💸 Expense
          </div>
        </label>
        <label className="cursor-pointer">
          <input
            type="radio"
            name="direction"
            value="IN"
            checked={direction === "IN"}
            onChange={() => switchDirection("IN")}
            className="peer sr-only"
          />
          <div className="rounded-md border-2 border-line bg-card py-3 text-center text-sm font-bold peer-checked:border-sagedeep peer-checked:bg-goodbg peer-checked:text-sagedeep">
            💰 Income
          </div>
        </label>
      </div>

      <div>
        <label className="block text-xs font-semibold text-inksoft mb-1.5">Amount (Rp)</label>
        <MoneyInput
          key={`amount-${formKey}`}
          name="amount"
          required
          defaultValue={seed.amount}
          placeholder="85.000,00"
          className="w-full rounded-md border border-line bg-card px-4 py-4 text-2xl font-display font-bold text-center money focus:outline-none focus:border-sagedeep"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-inksoft mb-1.5">Date &amp; time</label>
        <DateField
          name="date"
          mode="datetime"
          defaultValue={defaults?.date}
          defaultNow={!defaults?.date}
          title="Date & time"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label className="text-xs font-semibold text-inksoft">
            {direction === "IN" ? "Income category" : "Expense category"}
          </label>
          <Link href="/settings/categories" className="text-[11px] font-bold text-sagedeep">
            Manage
          </Link>
        </div>
        <Select
          name="categoryId"
          label={direction === "IN" ? "Income category" : "Expense category"}
          placeholder="No category"
          value={categoryId}
          onChange={setCategoryId}
          options={options}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-inksoft mb-1.5">Account</label>
        <Select
          key={`account-${formKey}`}
          name="accountId"
          required
          label="Account"
          defaultValue={seed.accountId}
          options={accounts}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-inksoft mb-1.5">Note (optional)</label>
        <input
          key={`note-${formKey}`}
          name="note"
          defaultValue={seed.note}
          placeholder="lunch, transport, etc."
          className="w-full rounded-md border border-line bg-card px-3 py-3 text-sm"
        />
      </div>

      {allowTemplate && (
        <div className="rounded-md border border-line bg-card p-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              name="saveAsTemplate"
              value="1"
              checked={saveTpl}
              onChange={(e) => setSaveTpl(e.target.checked)}
              className="h-4 w-4 accent-sagedeep"
            />
            <span className="text-[13px] font-semibold">Save as a one-tap template</span>
          </label>
          {saveTpl && (
            <div className="mt-3 flex items-center gap-2">
              <input
                name="templateEmoji"
                defaultValue="⭐"
                maxLength={8}
                aria-label="Template icon"
                className="w-12 text-center text-lg bg-cream2 rounded-md border border-line py-2"
              />
              <input
                name="templateName"
                placeholder="Name (e.g. Gojek to work)"
                maxLength={40}
                className="flex-1 min-w-0 rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
              />
            </div>
          )}
        </div>
      )}

      <SubmitButton
        className="w-full rounded-full bg-sagedeep text-cream2 font-bold py-4 text-sm"
        pendingText="Saving…"
      >
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
