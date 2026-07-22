import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const COLS: [string, string][] = [
  ["FinAccount", "balance"], ["DebtScheduleEntry", "planned"], ["DebtPayment", "amount"],
  ["DebtAdjustment", "delta"], ["Category", "budget"], ["Transaction", "amount"],
  ["RecurringBill", "amount"], ["PlannedTransaction", "amount"], ["Goal", "targetAmount"],
  ["GoalContribution", "amount"], ["MonthlySnapshot", "totalSavings"],
  ["MonthlySnapshot", "totalDebt"], ["MonthlySnapshot", "incomeReceived"],
  ["Settings", "monthlyIncome"], ["Settings", "monthlyExpense"],
];
const KEY = "money_scale";

async function sums() {
  const out: Record<string, bigint> = {};
  for (const [t, c] of COLS) {
    const r: { sum: string | null }[] = await prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM("${c}"),0)::text AS sum FROM "${t}"`);
    out[`${t}.${c}`] = BigInt(r[0].sum ?? "0");
  }
  return out;
}

async function main() {
  const before = await sums();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.appMeta.findUnique({ where: { key: KEY } });
    if (existing) throw new Error(`already scaled (${KEY}=${existing.value}) — refusing to run twice`);
    for (const [t, c] of COLS) {
      await tx.$executeRawUnsafe(`UPDATE "${t}" SET "${c}" = "${c}" * 100`);
    }
    await tx.appMeta.create({ data: { key: KEY, value: "100" } });
  });
  const after = await sums();

  let ok = true;
  for (const k of Object.keys(before)) {
    const b = before[k], a = after[k];
    const good = a === b * 100n;
    if (!good) ok = false;
    console.log(`${good ? "ok " : "BAD"} ${k}: ${b} -> ${a}`);
  }
  console.log(ok ? "\nALL 15 COLUMNS SCALED CORRECTLY" : "\nMISMATCH — investigate");
  if (!ok) process.exit(1);
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
