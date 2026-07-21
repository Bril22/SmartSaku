"use client";

import { payDebtMonth } from "@/app/actions";
import MoneyInput from "@/components/MoneyInput";
import Select, { type SelectOption } from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";

export default function PayForm({
  debtId,
  monthIso,
  dueLeft,
  accounts,
  backTo,
}: {
  debtId: string;
  monthIso: string;
  dueLeft: number;
  accounts: SelectOption[];
  backTo: string;
}) {
  return (
    <form action={payDebtMonth} className="space-y-2">
      <input type="hidden" name="debtId" value={debtId} />
      <input type="hidden" name="month" value={monthIso} />
      <input type="hidden" name="backTo" value={backTo} />
      <label className="block text-[10.5px] font-bold text-inksoft">
        Amount (full or partial)
      </label>
      <MoneyInput
        name="amount"
        required
        defaultValue={dueLeft}
        className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right money"
      />
      <label className="block text-[10.5px] font-bold text-inksoft">Pay from account</label>
      <Select name="accountId" required defaultValue={accounts[0]?.value} options={accounts} />
      <SubmitButton
        className="w-full bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-2"
        pendingText="Paying…"
      >
        Pay
      </SubmitButton>
    </form>
  );
}
