import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { addTransaction } from "@/app/actions";
import TransactionForm, { type CategoryOption } from "@/components/TransactionForm";

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { userId, spaceId } = await requireSpace();
  const { error } = await searchParams;
  const [accounts, categories] = await Promise.all([
    prisma.finAccount.findMany({
      where: { spaceId, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({ where: { spaceId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
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
        <div className="flex items-center gap-3">
          <Link href="/import" className="text-xs font-bold text-sagedeep">
            📄 Scan file
          </Link>
          <Link href="/money/transfer" className="text-xs font-bold text-sagedeep">
            ⇄ Transfer
          </Link>
        </div>
      </div>
      {error && (
        <div className="bg-badbg text-bad rounded-md px-4 py-3 text-sm font-semibold mb-4">
          Please fill the amount and pick an account.
        </div>
      )}
      <Link
        href="/import"
        className="flex items-center gap-3 bg-card border border-line rounded-lg p-3.5 mb-4 hover:border-sagedeep"
      >
        <span className="text-xl">📄</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[13px]">Scan a receipt or statement</div>
          <div className="text-[11.5px] text-inksoft">
            Photo, PDF, Excel or CSV — Saku AI fills the rows for you
          </div>
        </div>
        <span className="text-inksoft">›</span>
      </Link>

      <TransactionForm
        action={addTransaction}
        accounts={accounts.map((a) => ({
          value: a.id,
          label: a.hidden ? `${a.name} (hidden)` : a.name,
          icon: "🏦",
        }))}
        categories={categoryOptions}
        defaults={{ accountId: (accounts.find((a) => a.primary) ?? accounts[0])?.id }}
      />
    </div>
  );
}
