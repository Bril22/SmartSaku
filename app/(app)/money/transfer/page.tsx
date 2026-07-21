import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getMoney } from "@/lib/money";
import { transferBetweenAccounts } from "@/app/actions";
import MoneyInput from "@/components/MoneyInput";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";

export default async function TransferPage() {
  const { userId, spaceId } = await requireSpace();
  const [accounts, money] = await Promise.all([
    prisma.finAccount.findMany({
      where: { spaceId, archived: false },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    }),
    getMoney(userId),
  ]);
  const options = accounts.map((a) => ({
    value: a.id,
    label: `${a.name} · ${money.rpShort(Number(a.balance))}`,
    icon: "🏦",
  }));

  return (
    <div className="max-w-md mx-auto">
      <Link href="/add" className="text-xs font-bold text-sagedeep">
        ‹ Add transaction
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-1">Transfer money</h1>
      <p className="text-sm text-inksoft mb-5">
        Move money between your own accounts. This is not income or spending, so it never changes
        your reports — only the two balances.
      </p>

      {accounts.length < 2 ? (
        <div className="bg-warnbg text-warn rounded-md px-4 py-3 text-sm font-semibold">
          You need at least two accounts to transfer. Add one in Settings › Manage accounts.
        </div>
      ) : (
        <form action={transferBetweenAccounts} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1.5">From</label>
            <Select
              name="fromAccountId"
              required
              label="Transfer from"
              defaultValue={options[0]?.value}
              options={options}
            />
          </div>
          <div className="text-center text-lg text-inksoft">↓</div>
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1.5">To</label>
            <Select
              name="toAccountId"
              required
              label="Transfer to"
              defaultValue={options[1]?.value}
              options={options}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1.5">Amount (Rp)</label>
            <MoneyInput
              name="amount"
              required
              placeholder="1,000,000"
              className="w-full rounded-md border border-line bg-card px-4 py-4 text-2xl font-display font-bold text-center money focus:outline-none focus:border-sagedeep"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-inksoft mb-1.5">Note (optional)</label>
            <input
              name="note"
              placeholder="moving to savings"
              className="w-full rounded-md border border-line bg-card px-3 py-3 text-sm"
            />
          </div>
          <SubmitButton
            className="w-full rounded-full bg-sagedeep text-cream2 font-bold py-4 text-sm"
            pendingText="Transferring…"
          >
            Transfer
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
