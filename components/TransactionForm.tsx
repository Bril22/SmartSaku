"use client";

import Link from "next/link";
import { useState } from "react";
import MoneyInput from "@/components/MoneyInput";
import Select, { type SelectOption } from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";

export type CategoryOption = SelectOption & { type: "INCOME" | "EXPENSE" };

export default function TransactionForm({
  action,
  accounts,
  categories,
  defaults,
  submitLabel = "Save",
  extraFields,
}: {
  action: (formData: FormData) => void;
  accounts: SelectOption[];
  categories: CategoryOption[];
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

  return (
    <form action={action} className="space-y-4">
      {extraFields}
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
          name="amount"
          required
          defaultValue={defaults?.amount}
          placeholder="85,000"
          className="w-full rounded-md border border-line bg-card px-4 py-4 text-2xl font-display font-bold text-center money focus:outline-none focus:border-sagedeep"
        />
      </div>

      {defaults?.date !== undefined && (
        <div>
          <label className="block text-xs font-semibold text-inksoft mb-1.5">Date</label>
          <input
            type="date"
            name="date"
            defaultValue={defaults.date}
            className="w-full rounded-md border border-line bg-card px-3 py-3 text-sm"
          />
        </div>
      )}

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
          name="accountId"
          required
          label="Account"
          defaultValue={defaults?.accountId ?? accounts[0]?.value}
          options={accounts}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-inksoft mb-1.5">Note (optional)</label>
        <input
          name="note"
          defaultValue={defaults?.note}
          placeholder="lunch, transport, etc."
          className="w-full rounded-md border border-line bg-card px-3 py-3 text-sm"
        />
      </div>

      <SubmitButton
        className="w-full rounded-full bg-sagedeep text-cream2 font-bold py-4 text-sm"
        pendingText="Saving…"
      >
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
