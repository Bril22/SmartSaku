import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { addTransaction } from "@/app/actions";
import MoneyInput from "@/components/MoneyInput";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const userId = await requireUserId();
  const { error } = await searchParams;
  const [accounts, categories] = await Promise.all([
    prisma.finAccount.findMany({
      where: { userId, archived: false },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);
  const expenseCats = categories.filter((c) => c.type === "EXPENSE");
  const incomeCats = categories.filter((c) => c.type === "INCOME");

  return (
    <div className="max-w-md mx-auto">
      <h1 className="font-display text-2xl font-semibold mb-5">Add transaction</h1>
      {error && (
        <div className="bg-badbg text-bad rounded-md px-4 py-3 text-sm font-semibold mb-4">
          Please fill the amount and pick an account.
        </div>
      )}
      <form action={addTransaction} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="cursor-pointer">
            <input type="radio" name="direction" value="OUT" defaultChecked className="peer sr-only" />
            <div className="rounded-md border-2 border-line bg-card py-3 text-center text-sm font-bold peer-checked:border-peachdeep peer-checked:bg-badbg peer-checked:text-peachdeep">
              💸 Expense
            </div>
          </label>
          <label className="cursor-pointer">
            <input type="radio" name="direction" value="IN" className="peer sr-only" />
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
            placeholder="85,000"
            className="w-full rounded-md border border-line bg-card px-4 py-4 text-2xl font-display font-bold text-center money focus:outline-none focus:border-sagedeep"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inksoft mb-1.5">Category</label>
          <Select
            name="categoryId"
            label="Category"
            placeholder="No category"
            options={[
              { value: "", label: "No category" },
              ...expenseCats.map((c) => ({ value: c.id, label: c.name, icon: c.icon })),
              ...incomeCats.map((c) => ({ value: c.id, label: c.name, icon: c.icon })),
            ]}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inksoft mb-1.5">Account</label>
          <Select
            name="accountId"
            required
            label="Account"
            defaultValue={accounts[0]?.id}
            options={accounts.map((a) => ({ value: a.id, label: a.name, icon: "🏦" }))}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inksoft mb-1.5">Note (optional)</label>
          <input
            name="note"
            placeholder="lunch, transport, etc."
            className="w-full rounded-md border border-line bg-card px-3 py-3 text-sm"
          />
        </div>

        <SubmitButton
          className="w-full rounded-full bg-sagedeep text-cream2 font-bold py-4 text-sm"
          pendingText="Saving…"
        >
          Save
        </SubmitButton>
      </form>
    </div>
  );
}
