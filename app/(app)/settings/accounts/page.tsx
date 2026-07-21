import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getMoney } from "@/lib/money";
import { addAccount } from "@/app/actions";
import { deleteFinAccount, renameFinAccount, toggleArchiveAccount } from "@/app/settings/actions";
import MoneyInput from "@/components/MoneyInput";
import Popover from "@/components/Popover";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";

const TYPE_ICON: Record<string, string> = { BANK: "🏦", SAVINGS: "🌱", EWALLET: "📱", CASH: "💵" };

export default async function ManageAccountsPage() {
  const { userId, spaceId } = await requireSpace();
  const [accounts, money] = await Promise.all([
    prisma.finAccount.findMany({
      where: { spaceId },
      orderBy: [{ archived: "asc" }, { createdAt: "asc" }, { name: "asc" }],
    }),
    getMoney(userId),
  ]);
  const txCounts = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { spaceId },
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
                  {txCount === 0 ? (
                    <form action={deleteFinAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="font-extrabold text-bad">Delete</button>
                    </form>
                  ) : (
                    <Popover
                      trigger="Delete"
                      triggerClass="font-extrabold text-bad text-[11.5px]"
                      width="w-72"
                    >
                      <div className="text-[11px] font-bold text-inksoft">
                        {a.name} has {txCount} transaction{txCount === 1 ? "" : "s"}. What should
                        happen to them?
                      </div>
                      <form action={deleteFinAccount} className="space-y-2 border-t border-line pt-2">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="mode" value="move" />
                        <label className="block text-[10.5px] font-bold text-sagedeep">
                          Recommended — keep the history
                        </label>
                        <Select
                          name="targetAccountId"
                          required
                          defaultValue={accounts.find((x) => x.id !== a.id && !x.archived)?.id}
                          options={accounts
                            .filter((x) => x.id !== a.id && !x.archived)
                            .map((x) => ({ value: x.id, label: x.name, icon: TYPE_ICON[x.type] }))}
                        />
                        <SubmitButton
                          className="w-full bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-2"
                          pendingText="Moving…"
                        >
                          Move history here & delete
                        </SubmitButton>
                        <p className="text-[10px] text-inksoft">
                          Transactions, planned items, and the {money.rp(Number(a.balance))} balance
                          move to the chosen account.
                        </p>
                      </form>
                      <form action={deleteFinAccount} className="border-t border-line pt-2">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="mode" value="purge" />
                        <SubmitButton
                          className="w-full border border-bad text-bad rounded-full text-[11px] font-extrabold py-2"
                          pendingText="Deleting…"
                        >
                          Delete account + all its transactions
                        </SubmitButton>
                        <p className="text-[10px] text-bad mt-1">
                          History is removed from reports. Debt months paid from here reopen.
                        </p>
                      </form>
                    </Popover>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <h2 className="text-sm font-bold mt-6 mb-2">Add account</h2>
      <form action={addAccount} className="bg-card border border-line rounded-lg p-4 space-y-2.5">
        <input type="hidden" name="backTo" value="/settings/accounts" />
        <input
          name="name"
          required
          placeholder="Account name (e.g. BCA)"
          maxLength={40}
          className="w-full rounded-md border border-line bg-cream2 px-3.5 py-2.5 text-sm"
        />
        <div className="flex gap-2.5">
          <div className="flex-1">
            <Select
              name="type"
              defaultValue="BANK"
              options={[
                { value: "BANK", label: "Bank", icon: "🏦" },
                { value: "SAVINGS", label: "Savings", icon: "🌱" },
                { value: "EWALLET", label: "E-wallet", icon: "📱" },
                { value: "CASH", label: "Cash", icon: "💵" },
              ]}
            />
          </div>
          <div className="flex-1">
            <MoneyInput
              name="balance"
              placeholder="Starting balance"
              className="w-full rounded-md border border-line bg-cream2 px-3.5 py-3 text-sm text-right money"
            />
          </div>
        </div>
        <SubmitButton
          className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
          pendingText="Creating…"
        >
          Create account
        </SubmitButton>
      </form>

      <p className="text-[11.5px] text-inksoft mt-4">
        Archiving hides an account everywhere but keeps its history. Deleting one that has
        transactions asks first whether to move that history to another account (recommended) or
        remove it completely.
      </p>
    </div>
  );
}
