import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const { spaceId } = await requireSpace();

  const transactions = await prisma.transaction.findMany({
    where: { spaceId },
    include: { account: true, category: true },
    orderBy: { date: "desc" },
  });

  const header = ["Date", "Type", "Amount (IDR)", "Category", "Account", "Note", "Kind"];
  const rows = transactions.map((t) => [
    t.date.toISOString().slice(0, 10),
    t.direction === "IN" ? "Income" : "Expense",
    (Number(t.amount) / 100).toFixed(2),
    t.category?.name ?? "",
    t.account.name,
    t.note,
    t.transferId ? "Transfer" : t.plannedId ? "Planned" : t.importBatchId ? "Imported" : "Manual",
  ]);

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="smartsaku-transactions-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
