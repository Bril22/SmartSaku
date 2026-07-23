import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { formatMinor } from "@/lib/format";
import { addCategory, deleteCategory, updateCategory } from "@/app/settings/actions";
import MoneyInput from "@/components/MoneyInput";
import SubmitButton from "@/components/SubmitButton";
import AddPanel from "@/components/AddPanel";
import EditableCard from "@/components/EditableCard";

export default async function ManageCategoriesPage() {
  const { spaceId } = await requireSpace();
  const categories = await prisma.category.findMany({
    where: { spaceId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  const expense = categories.filter((c) => c.type === "EXPENSE");
  const income = categories.filter((c) => c.type === "INCOME");

  return (
    <div className="max-w-md">
      <Link href="/settings" className="text-xs font-bold text-sagedeep">
        ‹ Settings
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-5">Manage categories</h1>

      {(
        [
          ["Expense categories", expense, "EXPENSE"],
          ["Income categories", income, "INCOME"],
        ] as const
      ).map(([title, list, type]) => (
        <section key={type} className="mb-6">
          <h2 className="text-sm font-bold mb-2">{title}</h2>

          <AddPanel label={`Add ${type === "EXPENSE" ? "expense" : "income"} category`}>
            <form action={addCategory} className="flex items-center gap-2">
              <input type="hidden" name="type" value={type} />
              <input
                name="icon"
                placeholder="🏷️"
                maxLength={8}
                className="w-12 text-center text-lg bg-cream2 rounded-md border border-line py-2"
              />
              <input
                name="name"
                required
                placeholder="New category name"
                maxLength={30}
                className="flex-1 rounded-md border border-line bg-cream2 px-3 py-2.5 text-sm min-w-0"
              />
              <SubmitButton
                className="rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold px-4 py-2.5"
                pendingText="…"
              >
                Add
              </SubmitButton>
            </form>
          </AddPanel>

          <div className="space-y-2">
            {list.map((c) => (
              <EditableCard
                key={c.id}
                summary={
                  <span className="flex items-center gap-2.5">
                    <span className="text-lg">{c.icon}</span>
                    <span className="flex-1 font-semibold text-[13.5px]">{c.name}</span>
                    {type === "EXPENSE" && Number(c.budget) > 0 && (
                      <span className="text-[11px] text-inksoft money">
                        {formatMinor(Number(c.budget))}/mo
                      </span>
                    )}
                  </span>
                }
              >
                <form action={updateCategory} className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      name="icon"
                      defaultValue={c.icon}
                      maxLength={8}
                      className="w-10 text-center text-lg bg-cream2 rounded-md border border-line py-1.5"
                    />
                    <input
                      name="name"
                      defaultValue={c.name}
                      maxLength={30}
                      className="flex-1 rounded-md border border-line bg-cream2 px-3 py-2 text-sm min-w-0"
                    />
                  </div>
                  {type === "EXPENSE" && (
                    <div>
                      <label className="block text-[10.5px] font-bold text-inksoft mb-1">
                        Monthly budget
                      </label>
                      <MoneyInput
                        name="budget"
                        defaultValue={Number(c.budget)}
                        placeholder="no limit"
                        className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm text-right money"
                      />
                    </div>
                  )}
                  <SubmitButton
                    className="w-full rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold py-2.5"
                    pendingText="Saving…"
                  >
                    Save changes
                  </SubmitButton>
                </form>
                <form action={deleteCategory} className="mt-2 text-center">
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-[11px] font-extrabold text-bad">Delete category</button>
                </form>
              </EditableCard>
            ))}
          </div>
        </section>
      ))}
      <p className="text-[11.5px] text-inksoft">
        Deleting a category keeps its transactions — they just lose the label.
      </p>
    </div>
  );
}
