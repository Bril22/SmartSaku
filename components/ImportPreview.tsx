"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { confirmImport } from "@/app/import/actions";
import type { ImportRow } from "@/lib/importer";

type PreviewRow = ImportRow & { include: boolean; accountName: string; categoryName: string };

function ConfirmButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="w-full rounded-full bg-sagedeep text-cream2 font-bold py-4 text-sm disabled:opacity-60"
    >
      {pending ? "Importing…" : `Import ${count} transaction${count === 1 ? "" : "s"}`}
    </button>
  );
}

export default function ImportPreview({
  batchId,
  initialRows,
  accounts,
  categories,
}: {
  batchId: string;
  initialRows: ImportRow[];
  accounts: string[];
  categories: string[];
}) {
  const accountSet = useMemo(() => new Set(accounts.map((a) => a.toLowerCase())), [accounts]);
  const categorySet = useMemo(() => new Set(categories.map((c) => c.toLowerCase())), [categories]);
  const [rows, setRows] = useState<PreviewRow[]>(
    initialRows.map((r) => ({
      ...r,
      include: r.include ?? true,
      accountName: r.accountGuess || accounts[0] || "Imported",
      categoryName: r.categoryGuess || "",
    })),
  );

  const update = (i: number, patch: Partial<PreviewRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const selected = rows.filter((r) => r.include);
  const totalIn = selected.filter((r) => r.direction === "IN").reduce((a, r) => a + r.amount, 0);
  const totalOut = selected.filter((r) => r.direction === "OUT").reduce((a, r) => a + r.amount, 0);
  const newAccounts = [...new Set(selected.map((r) => r.accountName))].filter(
    (a) => !accountSet.has(a.toLowerCase()),
  );
  const newCategories = [...new Set(selected.map((r) => r.categoryName).filter(Boolean))].filter(
    (c) => !categorySet.has(c.toLowerCase()),
  );

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Income found</div>
          <div className="font-extrabold text-sagedeep money">+Rp{totalIn.toLocaleString("en-US")}</div>
        </div>
        <div className="bg-card border border-line rounded-md p-3">
          <div className="text-[10px] uppercase tracking-wide text-inksoft">Expenses found</div>
          <div className="font-extrabold text-peachdeep money">−Rp{totalOut.toLocaleString("en-US")}</div>
        </div>
      </div>

      {(newAccounts.length > 0 || newCategories.length > 0) && (
        <div className="bg-warnbg text-warn rounded-md px-4 py-3 text-[12.5px] font-semibold mb-4">
          Will be created on import:
          {newAccounts.length > 0 && ` accounts — ${newAccounts.join(", ")}.`}
          {newCategories.length > 0 && ` categories — ${newCategories.join(", ")}.`}
          {" Edit the names below if you want to match existing ones."}
        </div>
      )}

      <div className="space-y-2 mb-5">
        {rows.map((r, i) => (
          <div
            key={i}
            className={`bg-card border rounded-md p-3 ${r.include ? "border-line" : "border-line opacity-50"}`}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <input
                type="checkbox"
                checked={r.include}
                onChange={(e) => update(i, { include: e.target.checked })}
                className="w-4 h-4 accent-sagedeep shrink-0"
              />
              <input
                type="date"
                value={r.date}
                onChange={(e) => update(i, { date: e.target.value })}
                className="rounded-md border border-line bg-cream2 px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => update(i, { direction: r.direction === "IN" ? "OUT" : "IN" })}
                className={`rounded-full px-2.5 py-1 text-[10.5px] font-extrabold ${
                  r.direction === "IN" ? "bg-goodbg text-sagedeep" : "bg-badbg text-peachdeep"
                }`}
              >
                {r.direction === "IN" ? "Income" : "Expense"}
              </button>
              <input
                inputMode="numeric"
                value={r.amount.toLocaleString("en-US")}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^0-9]/g, ""));
                  update(i, { amount: n });
                }}
                className="flex-1 min-w-0 rounded-md border border-line bg-cream2 px-2 py-1.5 text-xs text-right money font-bold"
              />
            </div>
            <div className="flex gap-2">
              <input
                value={r.note}
                placeholder="Note"
                onChange={(e) => update(i, { note: e.target.value.slice(0, 120) })}
                className="flex-1 min-w-0 rounded-md border border-line bg-cream2 px-2 py-1.5 text-xs"
              />
              <input
                value={r.categoryName}
                placeholder="Category"
                list="import-categories"
                onChange={(e) => update(i, { categoryName: e.target.value.slice(0, 40) })}
                className={`w-24 rounded-md border px-2 py-1.5 text-xs ${
                  r.categoryName && !categorySet.has(r.categoryName.toLowerCase())
                    ? "border-warn bg-warnbg/40"
                    : "border-line bg-cream2"
                }`}
              />
              <input
                value={r.accountName}
                placeholder="Account"
                list="import-accounts"
                onChange={(e) => update(i, { accountName: e.target.value.slice(0, 40) })}
                className={`w-24 rounded-md border px-2 py-1.5 text-xs ${
                  !accountSet.has(r.accountName.toLowerCase())
                    ? "border-warn bg-warnbg/40"
                    : "border-line bg-cream2"
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      <datalist id="import-accounts">
        {accounts.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <datalist id="import-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <form action={confirmImport}>
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="rows" value={JSON.stringify(rows)} />
        <ConfirmButton count={selected.length} />
      </form>
      <p className="text-[11.5px] text-inksoft mt-3 text-center">
        Duplicates (same date, amount, and note) are skipped automatically.
      </p>
    </div>
  );
}
