import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { formatMinor } from "@/lib/format";

function csvCell(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function section(
  title: string,
  header: string[],
  rows: (string | number | boolean)[][],
): string {
  return [
    `# ${title}`,
    [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"),
    "",
  ].join("\n");
}

const money = (v: bigint | number) => formatMinor(Number(v));
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function GET() {
  const { spaceId, spaceName } = await requireSpace();

  const [accounts, categories, transactions, debts, planned, goals, corrections] =
    await Promise.all([
      prisma.finAccount.findMany({ where: { spaceId }, orderBy: { sortOrder: "asc" } }),
      prisma.category.findMany({ where: { spaceId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
      prisma.transaction.findMany({
        where: { spaceId },
        include: { account: true, category: true },
        orderBy: { date: "desc" },
      }),
      prisma.debt.findMany({
        where: { spaceId },
        include: { schedule: true, payments: true, adjustments: true },
        orderBy: { lender: "asc" },
      }),
      prisma.plannedTransaction.findMany({ where: { spaceId }, orderBy: { name: "asc" } }),
      prisma.goal.findMany({ where: { spaceId }, include: { contributions: true } }),
      prisma.balanceCorrection.findMany({
        where: { account: { spaceId } },
        include: { account: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const parts = [
    section(
      "Accounts",
      ["Name", "Type", "Balance", "Hidden", "Archived", "Main"],
      accounts.map((a) => [a.name, a.type, money(a.balance), a.hidden, a.archived, a.primary]),
    ),
    section(
      "Categories",
      ["Name", "Type", "Monthly budget"],
      categories.map((c) => [c.name, c.type, money(c.budget)]),
    ),
    section(
      "Transactions",
      ["Date", "Time", "Type", "Amount", "Category", "Account", "Note", "Kind"],
      transactions.map((t) => [
        day(t.date),
        t.date.toISOString().slice(11, 16),
        t.direction === "IN" ? "Income" : "Expense",
        money(t.amount),
        t.category?.name ?? "",
        t.account.name,
        t.note,
        t.transferId
          ? "Transfer"
          : t.plannedId
            ? "Planned"
            : t.importBatchId
              ? "Imported"
              : t.kind === "BALANCE_ADJUSTMENT"
                ? "Balance adjustment"
                : "Manual",
      ]),
    ),
    section(
      "Debts",
      ["Lender", "Planned total", "Paid total", "Adjustments", "Remaining"],
      debts.map((d) => {
        const plannedTotal = d.schedule.reduce((a, s) => a + Number(s.planned), 0);
        const paid = d.payments.reduce((a, p) => a + Number(p.amount), 0);
        const adj = d.adjustments.reduce((a, x) => a + Number(x.delta), 0);
        return [
          d.lender,
          money(plannedTotal),
          money(paid),
          money(adj),
          money(Math.max(0, plannedTotal + adj - paid)),
        ];
      }),
    ),
    section(
      "Debt schedule",
      ["Lender", "Month", "Planned"],
      debts.flatMap((d) =>
        d.schedule.map((s) => [d.lender, day(s.month), money(s.planned)]),
      ),
    ),
    section(
      "Debt payments",
      ["Lender", "Month", "Paid on", "Amount"],
      debts.flatMap((d) =>
        d.payments.map((p) => [d.lender, day(p.month), day(p.paidDate), money(p.amount)]),
      ),
    ),
    section(
      "Monthly plan",
      ["Name", "Direction", "Amount", "Day", "Starts", "Ends"],
      planned.map((p) => [
        p.name,
        p.direction === "IN" ? "Income" : "Expense",
        money(p.amount),
        p.dayOfMonth,
        p.startMonth ? day(p.startMonth) : "",
        p.endMonth ? day(p.endMonth) : "no end",
      ]),
    ),
    section(
      "Goals",
      ["Name", "Target", "Saved", "Target date"],
      goals.map((g) => [
        g.name,
        money(g.targetAmount),
        money(g.contributions.reduce((a, c) => a + Number(c.amount), 0)),
        g.targetDate ? day(g.targetDate) : "",
      ]),
    ),
    section(
      "Balance corrections",
      ["Account", "When", "Before", "After", "Reason"],
      corrections.map((c) => [
        c.account.name,
        day(c.createdAt),
        money(c.before),
        money(c.after),
        c.reason,
      ]),
    ),
  ];

  // BOM so Excel opens the Indonesian number format correctly
  const csv = "﻿" + parts.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = spaceName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="smartsaku-${safeName}-${stamp}.csv"`,
    },
  });
}
