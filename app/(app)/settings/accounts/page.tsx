import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { getMoney } from "@/lib/money";
import { deleteFinAccount, renameFinAccount, toggleArchiveAccount } from "@/app/settings/actions";
import SubmitButton from "@/components/SubmitButton";

const TYPE_ICON: Record<string, string> = { BANK: "🏦", SAVINGS: "🌱", EWALLET: "📱", CASH: "💵" };

export default async function ManageAccountsPage() {
  const userId = await requireUserId();
  const [accounts, money] = await Promise.all([
    prisma.finAccount.findMany({
      where: { userId },
      orderBy: [{ archived: "asc" }, { createdAt: "asc" }, { name: "asc" }],
    }),
    getMoney(userId),
  ]);
  const txCounts = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { userId },
    _count: { _all: true },
  });
  const txBy = new Map(txCounts.map((t) => [t.accountId, t._count._all]));

  return (
    <div className="max-w-md">
      <Link href="/settings" className="text-xs font-bold text-sagedeep">
        ‹ Settings
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-5">Manage accounts</h1>

      <div className="space-y-2.5">
        {accounts.map((a) => {
          const txCount = txBy.get(a.id) ?? 0;
          return (
            <div
              key={a.id}
              className={`bg-card border border-line rounded-lg p-4 ${a.archived ? "opacity-60" : ""}`}
            >
              <form action={renameFinAccount} className="flex items-center gap-2.5 mb-2">
                <span className="text-lg">{TYPE_ICON[a.type]}</span>
                <input type="hidden" name="id" value={a.id} />
                <input
                  name="name"
                  defaultValue={a.name}
                  maxLength={40}
                  className="flex-1 font-bold text-[14px] bg-transparent border-b border-transparent focus:border-line focus:outline-none min-w-0"
                />
                <SubmitButton className="text-[11px] font-extrabold text-sagedeep" pendingText="…">
                  Rename
                </SubmitButton>
              </form>
              <div className="flex items-center justify-between text-[11.5px] text-inksoft">
                <span>
                  {money.rp(Number(a.balance))} · {txCount} transaction{txCount === 1 ? "" : "s"}
                  {a.archived && " · archived"}
                </span>
                <span className="flex gap-3">
                  <form action={toggleArchiveAccount}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="font-extrabold text-earth">
                      {a.archived ? "Restore" : "Archive"}
                    </button>
                  </form>
                  {txCount === 0 && (
                    <form action={deleteFinAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="font-extrabold text-bad">Delete</button>
                    </form>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11.5px] text-inksoft mt-4">
        Accounts with transactions can be archived (hidden everywhere) but not deleted, so your
        history stays correct.
      </p>
    </div>
  );
}
