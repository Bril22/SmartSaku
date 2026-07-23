import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getMoney } from "@/lib/money";
import { addTransaction } from "@/app/actions";
import TransactionForm, {
  type CategoryOption,
  type TemplateOption,
} from "@/components/TransactionForm";

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { userId, spaceId } = await requireSpace();
  const { error } = await searchParams;
  const [accounts, categories, templates, money] = await Promise.all([
    prisma.finAccount.findMany({
      where: { spaceId, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({ where: { spaceId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.transactionTemplate.findMany({
      where: { spaceId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 20,
    }),
    getMoney(userId),
  ]);

  const categoryOptions: CategoryOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    icon: c.icon,
    type: c.type,
  }));

  const templateOptions: TemplateOption[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    direction: t.direction,
    amount: Number(t.amount),
    categoryId: t.categoryId,
    accountId: t.accountId,
    note: t.note,
    amountLabel: money.rpShort(Number(t.amount)),
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
      <Link
        href="/import?from=add"
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
        templates={templateOptions}
        allowTemplate
        offline
        defaults={{ accountId: (accounts.find((a) => a.primary) ?? accounts[0])?.id }}
      />
    </div>
  );
}
