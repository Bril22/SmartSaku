import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getMoney } from "@/lib/money";
import { addTemplate, updateTemplate, deleteTemplate } from "@/app/settings/actions";
import MoneyInput from "@/components/MoneyInput";
import Select, { type SelectOption } from "@/components/Select";
import SubmitButton from "@/components/SubmitButton";
import AddPanel from "@/components/AddPanel";
import EditableCard from "@/components/EditableCard";

const DIRECTIONS: SelectOption[] = [
  { value: "OUT", label: "Expense", icon: "💸" },
  { value: "IN", label: "Income", icon: "💰" },
];

export default async function ManageTemplatesPage() {
  const { userId, spaceId } = await requireSpace();
  const [templates, accounts, categories, money] = await Promise.all([
    prisma.transactionTemplate.findMany({
      where: { spaceId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.finAccount.findMany({
      where: { spaceId, archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({ where: { spaceId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    getMoney(userId),
  ]);

  const accountOptions: SelectOption[] = accounts.map((a) => ({
    value: a.id,
    label: a.hidden ? `${a.name} (hidden)` : a.name,
    icon: "🏦",
  }));
  const categoryOptions: SelectOption[] = [
    { value: "", label: "No category" },
    ...categories.map((c) => ({
      value: c.id,
      label: `${c.name} · ${c.type === "INCOME" ? "income" : "expense"}`,
      icon: c.icon,
    })),
  ];

  const fields = (t?: (typeof templates)[number]) => (
    <>
      <div className="flex items-center gap-2">
        <input
          name="emoji"
          defaultValue={t?.emoji ?? "⭐"}
          maxLength={8}
          aria-label="Icon"
          className="w-12 text-center text-lg bg-cream2 rounded-md border border-line py-2"
        />
        <input
          name="name"
          required
          defaultValue={t?.name}
          placeholder="Name (e.g. Gojek to work)"
          maxLength={40}
          className="flex-1 min-w-0 rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select name="direction" label="Type" defaultValue={t?.direction ?? "OUT"} options={DIRECTIONS} />
        <MoneyInput
          name="amount"
          defaultValue={t ? Number(t.amount) : undefined}
          placeholder="Amount"
          className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm text-right money"
        />
      </div>
      <Select
        name="categoryId"
        label="Category"
        placeholder="No category"
        defaultValue={t?.categoryId ?? ""}
        options={categoryOptions}
      />
      {accountOptions.length > 0 && (
        <Select
          name="accountId"
          label="Account"
          defaultValue={t?.accountId ?? accountOptions[0]?.value}
          options={accountOptions}
        />
      )}
      <input
        name="note"
        defaultValue={t?.note}
        placeholder="Note (optional)"
        maxLength={120}
        className="w-full rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm"
      />
    </>
  );

  return (
    <div className="max-w-md">
      <Link href="/settings" className="text-xs font-bold text-sagedeep">
        ‹ Settings
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-1">Quick templates</h1>
      <p className="text-[12.5px] text-inksoft mb-5">
        Save the transactions you log often. On the Add screen, one tap fills the form.
      </p>

      <AddPanel label="Add a template">
        <form action={addTemplate} className="space-y-2.5">
          {fields()}
          <SubmitButton
            className="w-full rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold py-2.5"
            pendingText="Saving…"
          >
            Save template
          </SubmitButton>
        </form>
      </AddPanel>

      {templates.length === 0 ? (
        <p className="text-[12.5px] text-inksoft mt-4">
          No templates yet. You can also tick “Save as a one-tap template” while adding a
          transaction.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <EditableCard
              key={t.id}
              summary={
                <span className="flex items-center gap-2.5">
                  <span className="text-lg">{t.emoji}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-[13.5px] truncate">{t.name}</span>
                    {t.note && (
                      <span className="block text-[11px] text-inksoft truncate">{t.note}</span>
                    )}
                  </span>
                  <span
                    className={`text-[12px] font-bold money ${
                      t.direction === "IN" ? "text-sagedeep" : "text-peachdeep"
                    }`}
                  >
                    {t.direction === "IN" ? "+" : "−"}
                    {money.rpShort(Number(t.amount))}
                  </span>
                </span>
              }
            >
              <form action={updateTemplate} className="space-y-2.5">
                <input type="hidden" name="id" value={t.id} />
                {fields(t)}
                <SubmitButton
                  className="w-full rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold py-2.5"
                  pendingText="Saving…"
                >
                  Save changes
                </SubmitButton>
              </form>
              <form action={deleteTemplate} className="mt-2 text-center">
                <input type="hidden" name="id" value={t.id} />
                <button className="text-[11px] font-extrabold text-bad">Delete template</button>
              </form>
            </EditableCard>
          ))}
        </div>
      )}
    </div>
  );
}
