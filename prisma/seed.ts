import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Baseline from debt-dashboard.html: 50 months starting Jul 2026
const START = { y: 2026, m: 6 }; // 0-indexed month (6 = July)
const HORIZON = 50;

const BASELINE: Record<string, number[]> = {
  SPinjam: [11798479, 5216202, 5216202, 5216202, 4444082, 4444082, 4444082, 4444082, 4444082, 3235499, 1474000],
  SPayLater: [3958782, 2254679, 2203701, 1408994, 1245310, 1245304, 583838, 583838, 583838, 583838, 583837, 418459, 418459, 418459, 418442, 77302, 77302, 77302],
  SMBC: [3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 3089223, 2765890, 2765890, 2765890, 2765890, 2765890, 2765890, 1648779, 1648779, 1648779, 1648779, 1648779, 1648779, 1648779, 452946, 452946, 452946, 452946, 452946, 452946, 452946, 452946, 238946, 238946, 238946, 238946, 238946, 238946],
  Tunaiku: Array(24).fill(1938385),
  GoPay: [3842693],
  Traveloka: [0, 1057489, 872424, 599972, 443997, 264197, 255849, 246975, 237536, 51715],
  "Home Credit": Array(6).fill(1100000),
};

const COLORS: Record<string, string> = {
  SPinjam: "#C96F4A",
  SPayLater: "#E8A07C",
  SMBC: "#827148",
  Tunaiku: "#A5AF79",
  GoPay: "#6E7A4C",
  Traveloka: "#B98A5E",
  "Home Credit": "#D9B08C",
};

function monthDate(i: number): Date {
  return new Date(Date.UTC(START.y, START.m + i, 1));
}

async function main() {
  const email = "fttmbril22@gmail.com";
  const password = process.env.SEED_USER_PASSWORD ?? "smartsaku123";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Bril", passwordHash },
    update: {},
  });
  console.log("User:", user.email);

  // settings
  await prisma.settings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      monthlyIncome: 27_500_000n,
      livingRent: 4_000_000n,
      livingFood: 2_000_000n,
      livingFamily: 3_000_000n,
      livingOther: 1_000_000n,
      salaryGrowthPct: 5,
      inflationPct: 3,
      savingsRatePct: 2,
    },
    update: {},
  });

  // accounts (only if none yet)
  const accountCount = await prisma.finAccount.count({ where: { userId: user.id } });
  if (accountCount === 0) {
    await prisma.finAccount.createMany({
      data: [
        { userId: user.id, name: "Bank (main)", type: "BANK", balance: 12_000_000n },
        { userId: user.id, name: "Savings", type: "SAVINGS", balance: 0n },
      ],
    });
    console.log("Accounts created (starting savings Rp12.000.000)");
  }

  // categories
  const cats: { name: string; type: "INCOME" | "EXPENSE"; icon: string }[] = [
    { name: "Salary", type: "INCOME", icon: "💰" },
    { name: "Bonus", type: "INCOME", icon: "🎁" },
    { name: "Food", type: "EXPENSE", icon: "🍜" },
    { name: "Rent", type: "EXPENSE", icon: "🏠" },
    { name: "Family", type: "EXPENSE", icon: "👨‍👩‍👧" },
    { name: "Transport", type: "EXPENSE", icon: "🚌" },
    { name: "Other", type: "EXPENSE", icon: "🧾" },
  ];
  for (const c of cats) {
    await prisma.category.upsert({
      where: { userId_name_type: { userId: user.id, name: c.name, type: c.type } },
      create: { userId: user.id, ...c },
      update: {},
    });
  }

  // recurring bills from living costs
  const billCount = await prisma.recurringBill.count({ where: { userId: user.id } });
  if (billCount === 0) {
    const rentCat = await prisma.category.findFirst({ where: { userId: user.id, name: "Rent" } });
    const famCat = await prisma.category.findFirst({ where: { userId: user.id, name: "Family" } });
    await prisma.recurringBill.createMany({
      data: [
        { userId: user.id, name: "Rent", amount: 4_000_000n, dueDay: 28, categoryId: rentCat?.id },
        { userId: user.id, name: "Family support", amount: 3_000_000n, dueDay: 1, categoryId: famCat?.id },
      ],
    });
  }

  // debts + schedules
  for (const [lender, arr] of Object.entries(BASELINE)) {
    const debt = await prisma.debt.upsert({
      where: { userId_lender: { userId: user.id, lender } },
      create: { userId: user.id, lender, color: COLORS[lender] ?? "#E8A07C" },
      update: {},
    });
    const existing = await prisma.debtScheduleEntry.count({ where: { debtId: debt.id } });
    if (existing === 0) {
      const rows = [];
      for (let i = 0; i < Math.min(arr.length, HORIZON); i++) {
        if (arr[i] > 0) rows.push({ debtId: debt.id, month: monthDate(i), planned: BigInt(arr[i]) });
      }
      await prisma.debtScheduleEntry.createMany({ data: rows });
      console.log(`Debt ${lender}: ${rows.length} scheduled payments`);
    }
  }

  console.log("\nSeed done. Login with", email, "/ password:", password);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
