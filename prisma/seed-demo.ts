import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Demo account with fictional data — safe for screenshots and testing.
// Login: demo@smartsaku.app / password below (or DEMO_USER_PASSWORD).
const prisma = new PrismaClient();

const START = { y: 2026, m: 6 }; // Jul 2026

function monthDate(i: number): Date {
  return new Date(Date.UTC(START.y, START.m + i, 1));
}

function flatSchedule(total: number, months: number): number[] {
  const per = Math.round(total / months);
  return Array(months).fill(per);
}

async function main() {
  const email = "demo@smartsaku.app";
  const password = process.env.DEMO_USER_PASSWORD ?? "demo1234";
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.delete({ where: { id: existing.id } }); // reset demo data
  }
  const user = await prisma.user.create({ data: { email, name: "Sari", passwordHash } });

  await prisma.settings.create({
    data: {
      userId: user.id,
      monthlyIncome: 15_000_000_00n,
      monthlyExpense: 6_500_000_00n,
      salaryGrowthPct: 5,
      inflationPct: 3,
      savingsRatePct: 3,
    },
  });

  const bank = await prisma.finAccount.create({
    data: { userId: user.id, name: "BCA", type: "BANK", balance: 6_750_000_00n },
  });
  await prisma.finAccount.createMany({
    data: [
      { userId: user.id, name: "Tabungan", type: "SAVINGS", balance: 4_200_000_00n },
      { userId: user.id, name: "GoPay", type: "EWALLET", balance: 350_000_00n },
    ],
  });

  const cats: { name: string; type: "INCOME" | "EXPENSE"; icon: string }[] = [
    { name: "Salary", type: "INCOME", icon: "💰" },
    { name: "Food", type: "EXPENSE", icon: "🍜" },
    { name: "Rent", type: "EXPENSE", icon: "🏠" },
    { name: "Family", type: "EXPENSE", icon: "👨‍👩‍👧" },
    { name: "Transport", type: "EXPENSE", icon: "🚌" },
    { name: "Fun", type: "EXPENSE", icon: "🎬" },
  ];
  const catIds: Record<string, string> = {};
  for (const c of cats) {
    const cat = await prisma.category.create({ data: { userId: user.id, ...c } });
    catIds[c.name] = cat.id;
  }

  await prisma.plannedTransaction.createMany({
    data: [
      { userId: user.id, name: "Gaji bulanan", amount: 15_000_000_00n, direction: "IN", dayOfMonth: 1, categoryId: catIds.Salary },
      { userId: user.id, name: "Kos/Rent", amount: 2_500_000_00n, direction: "OUT", dayOfMonth: 28, categoryId: catIds.Rent },
      { userId: user.id, name: "Internet", amount: 350_000_00n, direction: "OUT", dayOfMonth: 5, categoryId: catIds.Fun },
    ],
  });

  // debts: one nearly finished, two mid-flight
  const debts: { lender: string; color: string; schedule: number[] }[] = [
    { lender: "KTA Bank Biru", color: "#31694E", schedule: flatSchedule(36_000_000, 24) },
    { lender: "PayNanti", color: "#C96F4A", schedule: flatSchedule(4_800_000, 6) },
    { lender: "Cicilan HP", color: "#BBC863", schedule: flatSchedule(3_600_000, 3) },
  ];
  for (const d of debts) {
    const debt = await prisma.debt.create({
      data: { userId: user.id, lender: d.lender, color: d.color },
    });
    await prisma.debtScheduleEntry.createMany({
      data: d.schedule.map((amt, i) => ({ debtId: debt.id, month: monthDate(i), planned: BigInt(amt) * 100n })),
    });
    // Cicilan HP: 2 of 3 already paid → shows progress; PayNanti: July paid
    const paidMonths = d.lender === "Cicilan HP" ? [0, 1] : d.lender === "PayNanti" ? [0] : [];
    for (const i of paidMonths) {
      await prisma.debtPayment.create({
        data: { debtId: debt.id, month: monthDate(i), amount: BigInt(d.schedule[i]) * 100n, status: "PAID" },
      });
    }
  }

  // July transactions
  const tx: { amount: number; direction: "IN" | "OUT"; cat: string; note: string; day: number }[] = [
    { amount: 15_000_000, direction: "IN", cat: "Salary", note: "Gaji Juli", day: 1 },
    { amount: 2_500_000, direction: "OUT", cat: "Rent", note: "Kos bulan Juli", day: 2 },
    { amount: 85_000, direction: "OUT", cat: "Food", note: "nasi padang", day: 15 },
    { amount: 42_000, direction: "OUT", cat: "Transport", note: "grab", day: 16 },
    { amount: 120_000, direction: "OUT", cat: "Fun", note: "bioskop", day: 18 },
    { amount: 65_000, direction: "OUT", cat: "Food", note: "kopi + lunch", day: 19 },
  ];
  for (const t of tx) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: bank.id,
        categoryId: catIds[t.cat],
        amount: BigInt(t.amount) * 100n,
        direction: t.direction,
        note: t.note,
        date: new Date(Date.UTC(2026, 6, t.day, 8)),
      },
    });
  }

  console.log("Demo user ready:", email, "/", password);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
