import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: { account: true, category: true },
    orderBy: { date: "desc" },
  });

  const header = ["Date", "Type", "Amount (IDR)", "Category", "Account", "Note", "Kind"];
  const rows = transactions.map((t) => [
    t.date.toISOString().slice(0, 10),
    t.direction === "IN" ? "Income" : "Expense",
    Number(t.amount),
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
