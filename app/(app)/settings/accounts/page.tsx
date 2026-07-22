import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getMoney } from "@/lib/money";
import {
  addAccount,
  setPrimaryAccount,
  toggleAccountHidden,
  updateAccountBalance,
} from "@/app/actions";
import { deleteFinAccount, renameFinAccount, toggleArchiveAccount } from "@/app/settings/actions";
import MoneyInput from "@/components/MoneyInput";
import Popover from "@/components/Popover";
import Select from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";
import AccountOrder from "@/components/AccountOrder";

const TYPE_ICON: Record<string, string> = { BANK: "🏦", SAVINGS: "🌱", EWALLET: "📱", CASH: "💵" };

export default async function ManageAccountsPage() {
  const { userId, spaceId } = await requireSpace();
  const [accounts, money] = await Promise.all([
    prisma.finAccount.findMany({
      where: { spaceId },
      orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
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
      <h1 className="font-display text-2xl font-semibold mt-1 mb-1">Manage accounts</h1>
      <p className="text-[12px] text-inksoft mb-4">
        Drag the handle (or use the arrows) to set the order you see everywhere. The main account
        is picked first on new transactions.
      </p>

      <AccountOrder
        items={accounts
          .filter((a) => !a.archived)
          .map((a) => ({
            id: a.id,
            name: a.name,
            icon: TYPE_ICON[a.type],
            balance: money.rp(Number(a.balance)),
            hidden: a.hidden,
            primary: a.primary,
          }))}
      />

      <h2 className="text-sm font-bold mt-6 mb-2">Account details</h2>
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
              <div className="flex flex-wrap items-center gap-2 mb-2.5">
                <Popover
                  trigger={`${money.rp(Number(a.balance))} ✎`}
                  triggerClass="font-extrabold money text-[12.5px] border-b border-dashed border-earth/50"
                  width="w-72"
                >
                  <form action={updateAccountBalance} className="space-y-2">
                    <input type="hidden" name="accountId" value={a.id} />
                    <input type="hidden" name="backTo" value="/settings/accounts" />
                    <label className="block text-[10.5px] font-bold text-inksoft">
                      What does the bank say?
                    </label>
                    <MoneyInput
                      name="balance"
                      required
                      defaultValue={Number(a.balance)}
                      className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right money"
                    />
                    <input
                      name="reason"
                      placeholder="Note (interest, cash spent, …)"
                      className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-xs"
                    />
                    <label className="block text-[10.5px] font-bold text-inksoft pt-1">
                      How should the difference be treated?
                    </label>
                    <SubmitButton
                      name="mode"
                      value="record"
                      className="w-full bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-2"
                      pendingText="Saving…"
                    >
                      Record it as income / expense
                    </SubmitButton>
                    <SubmitButton
                      name="mode"
                      value="correct"
                      className="w-full border border-line text-earth rounded-full text-[11px] font-extrabold py-2"
                      pendingText="Saving…"
                    >
                      Just correct the balance
                    </SubmitButton>
                    <p className="text-[10px] text-inksoft">
                      Recording keeps your charts honest. Correcting writes an audit note instead.
                    </p>
                  </form>
                </Popover>
                {!a.archived && !a.primary && (
                  <form action={setPrimaryAccount}>
                    <input type="hidden" name="accountId" value={a.id} />
                    <button className="text-[10.5px] font-extrabold text-sagedeep border border-line rounded-full px-2.5 py-1">
                      Set as main
                    </button>
                  </form>
                )}
                {a.primary && (
                  <span className="text-[10.5px] font-extrabold text-sagedeep bg-goodbg rounded-full px-2.5 py-1">
                    ★ Main account
                  </span>
                )}
                {!a.archived && (
                  <form action={toggleAccountHidden}>
                    <input type="hidden" name="accountId" value={a.id} />
                    <button
                      className={`text-[10.5px] font-extrabold rounded-full px-2.5 py-1 border ${
                        a.hidden ? "border-earth text-earth bg-warnbg" : "border-line text-inksoft"
                      }`}
                    >
                      {a.hidden ? "🙈 Hidden from totals" : "Hide from totals"}
                    </button>
                  </form>
                )}
              </div>
              <div className="flex items-center justify-between text-[11.5px] text-inksoft">
                <span>
                  {txCount} transaction{txCount === 1 ? "" : "s"}
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
        Hiding leaves an account out of totals and charts, but you can still transfer money to and
        from it. Archiving removes it from the pickers while keeping its history. Deleting one that
        has transactions asks first whether to move that history to another account (recommended)
        or remove it completely.
      </p>
    </div>
  );
}
