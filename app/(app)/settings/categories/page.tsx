import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { addCategory, deleteCategory, updateCategory } from "@/app/settings/actions";
import MoneyInput from "@/components/MoneyInput";
import SubmitButton from "@/components/SubmitButton";

export default async function ManageCategoriesPage() {
  const userId = await requireUserId();
  const categories = await prisma.category.findMany({
    where: { userId },
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

      {[
        ["Expense categories", expense, "EXPENSE"],
        ["Income categories", income, "INCOME"],
      ].map(([title, list, type]) => (
        <section key={type as string} className="mb-6">
          <h2 className="text-sm font-bold mb-2">{title as string}</h2>
          <div className="space-y-2">
            {(list as typeof categories).map((c) => (
              <div key={c.id} className="bg-card border border-line rounded-lg px-3.5 py-3">
                <form action={updateCategory} className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      name="icon"
                      defaultValue={c.icon}
                      maxLength={8}
                      className="w-10 text-center text-lg bg-cream2 rounded-md border border-line py-1"
                    />
                    <input
                      name="name"
                      defaultValue={c.name}
                      maxLength={30}
                      className="flex-1 font-semibold text-[13.5px] bg-transparent border-b border-transparent focus:border-line focus:outline-none min-w-0"
                    />
                    <SubmitButton className="text-[11px] font-extrabold text-sagedeep" pendingText="…">
                      Save
                    </SubmitButton>
                  </div>
                  {type === "EXPENSE" && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10.5px] font-bold text-inksoft shrink-0">
                        Monthly budget
                      </span>
                      <div className="flex-1">
                        <MoneyInput
                          name="budget"
                          defaultValue={Number(c.budget)}
                          placeholder="no limit"
                          className="w-full rounded-md border border-line bg-cream2 px-2.5 py-1.5 text-xs text-right money"
                        />
                      </div>
                    </div>
                  )}
                </form>
                <form action={deleteCategory} className="text-right mt-1">
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-[11px] font-extrabold text-bad">Delete</button>
                </form>
              </div>
            ))}
          </div>
          <form action={addCategory} className="flex items-center gap-2 mt-2.5">
            <input type="hidden" name="type" value={type as string} />
            <input
              name="icon"
              placeholder="🏷️"
              maxLength={8}
              className="w-12 text-center text-lg bg-card rounded-md border border-line py-2"
            />
            <input
              name="name"
              required
              placeholder="New category name"
              maxLength={30}
              className="flex-1 rounded-md border border-line bg-card px-3 py-2.5 text-sm min-w-0"
            />
            <SubmitButton
              className="rounded-full bg-sagedeep text-cream2 text-[11px] font-extrabold px-4 py-2.5"
              pendingText="…"
            >
              Add
            </SubmitButton>
          </form>
        </section>
      ))}
      <p className="text-[11.5px] text-inksoft">
        Deleting a category keeps its transactions — they just lose the label.
      </p>
    </div>
  );
}
