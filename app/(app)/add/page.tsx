import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { addTransaction } from "@/app/actions";
import TransactionForm, { type CategoryOption } from "@/components/TransactionForm";

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
    prisma.category.findMany({ where: { userId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
  ]);

  const categoryOptions: CategoryOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    icon: c.icon,
    type: c.type,
  }));

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="font-display text-2xl font-semibold">Add transaction</h1>
        <Link href="/money/transfer" className="text-xs font-bold text-sagedeep">
          ⇄ Transfer
        </Link>
      </div>
      {error && (
        <div className="bg-badbg text-bad rounded-md px-4 py-3 text-sm font-semibold mb-4">
          Please fill the amount and pick an account.
        </div>
      )}
      <TransactionForm
        action={addTransaction}
        accounts={accounts.map((a) => ({ value: a.id, label: a.name, icon: "🏦" }))}
        categories={categoryOptions}
      />
    </div>
  );
}
