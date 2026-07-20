import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { deleteTransaction, updateTransaction } from "@/app/actions";
import MoneyInput from "@/components/MoneyInput";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const [tx, accounts, categories] = await Promise.all([
    prisma.transaction.findFirst({ where: { id, userId }, include: { category: true } }),
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({ where: { userId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
  ]);
  if (!tx) notFound();

  const monthParam = `${tx.date.getUTCFullYear()}-${String(tx.date.getUTCMonth() + 1).padStart(2, "0")}`;
  const backTo = `/money?tab=history&month=${monthParam}`;
  const dateValue = tx.date.toISOString().slice(0, 10);

  return (
    <div className="max-w-md mx-auto">
      <Link href={backTo} className="text-xs font-bold text-sagedeep">
        ‹ History
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-5">Edit transaction</h1>

      <form action={updateTransaction} className="space-y-4">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="backTo" value={backTo} />

        <div className="grid grid-cols-2 gap-2">
          <label className="cursor-pointer">
            <input
              type="radio"
              name="direction"
              value="OUT"
              defaultChecked={tx.direction === "OUT"}
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
              defaultChecked={tx.direction === "IN"}
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
            defaultValue={Number(tx.amount)}
            className="w-full rounded-md border border-line bg-card px-4 py-4 text-2xl font-display font-bold text-center money focus:outline-none focus:border-sagedeep"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1.5">Date</label>
            <input
              type="date"
              name="date"
              defaultValue={dateValue}
              className="w-full rounded-md border border-line bg-card px-3 py-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1.5">Account</label>
            <Select
              name="accountId"
              required
              defaultValue={tx.accountId}
              options={accounts.map((a) => ({ value: a.id, label: a.name, icon: "🏦" }))}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-inksoft mb-1.5">Category</label>
          <Select
            name="categoryId"
            placeholder="No category"
            defaultValue={tx.categoryId ?? ""}
            options={[
              { value: "", label: "No category" },
              ...categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon })),
            ]}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inksoft mb-1.5">Note (optional)</label>
          <input
            name="note"
            defaultValue={tx.note}
            placeholder="lunch, transport, etc."
            className="w-full rounded-md border border-line bg-card px-3 py-3 text-sm"
          />
        </div>

        <SubmitButton
          className="w-full rounded-full bg-sagedeep text-cream2 font-bold py-4 text-sm"
          pendingText="Saving…"
        >
          Save changes
        </SubmitButton>
      </form>

      <form action={deleteTransaction} className="mt-3">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="backTo" value={backTo} />
        <SubmitButton
          className="w-full rounded-full border-2 border-bad text-bad font-bold py-3.5 text-sm"
          pendingText="Deleting…"
        >
          Delete transaction
        </SubmitButton>
      </form>
      <p className="text-[11.5px] text-inksoft mt-3 text-center">
        Editing or deleting updates the account balance and every forecast automatically.
      </p>
    </div>
  );
}
