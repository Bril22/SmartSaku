"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, destroySession, getSessionUserId } from "@/lib/auth";
import { monthKey } from "@/lib/format";

async function requireUser(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  return userId;
}

/* ---------- auth ---------- */

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    redirect("/login?error=1");
  }
  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function register(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/register?error=email");
  if (password.length < 6) redirect("/register?error=short");
  if (password !== confirm) redirect("/register?error=match");
  if (await prisma.user.findUnique({ where: { email } })) redirect("/register?error=exists");

  const name = email.split("@")[0].replace(/^./, (c) => c.toUpperCase());
  const user = await prisma.user.create({
    data: { email, name, passwordHash: await bcrypt.hash(password, 10) },
  });
  // starter data so every screen works right away
  await prisma.settings.create({ data: { userId: user.id } });
  await prisma.finAccount.create({
    data: { userId: user.id, name: "Cash", type: "CASH", balance: 0n },
  });
  await prisma.category.createMany({
    data: (
      [
        { name: "Salary", type: "INCOME", icon: "💰" },
        { name: "Food", type: "EXPENSE", icon: "🍜" },
        { name: "Rent", type: "EXPENSE", icon: "🏠" },
        { name: "Family", type: "EXPENSE", icon: "👨‍👩‍👧" },
        { name: "Transport", type: "EXPENSE", icon: "🚌" },
        { name: "Other", type: "EXPENSE", icon: "🧾" },
      ] as const
    ).map((c) => ({ userId: user.id, ...c })),
  });
  await createSession(user.id);
  redirect("/?ok=" + encodeURIComponent(`Welcome to SmartSaku, ${name}! 🌱`));
}

/* ---------- money ---------- */

export async function addTransaction(formData: FormData) {
  const userId = await requireUser();
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const direction = formData.get("direction") === "IN" ? "IN" : "OUT";
  const accountId = String(formData.get("accountId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const note = String(formData.get("note") ?? "");
  if (!amount || !accountId) redirect("/add?error=1");

  const account = await prisma.finAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) redirect("/add?error=1");

  await prisma.$transaction([
    prisma.transaction.create({
      data: { userId, accountId, categoryId, amount: BigInt(amount), direction, note },
    }),
    prisma.finAccount.update({
      where: { id: accountId },
      data: { balance: { [direction === "IN" ? "increment" : "decrement"]: BigInt(amount) } },
    }),
  ]);
  revalidatePath("/");
  revalidatePath("/money");
  if (direction === "IN") {
    redirect("/money?ok=" + encodeURIComponent("Income recorded 💰") + "&fx=money");
  }
  redirect("/money?ok=" + encodeURIComponent("Expense saved"));
}

export async function addAccount(formData: FormData) {
  const userId = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "BANK") as "BANK" | "SAVINGS" | "EWALLET" | "CASH";
  const balance = Math.round(Number(formData.get("balance") ?? 0));
  if (!name) redirect("/money");
  await prisma.finAccount.create({ data: { userId, name, type, balance: BigInt(balance) } });
  revalidatePath("/money");
  redirect("/money?ok=" + encodeURIComponent(`Account "${name}" created`));
}

export async function updateAccountBalance(formData: FormData) {
  const userId = await requireUser();
  const id = String(formData.get("accountId") ?? "");
  const balance = Math.round(Number(formData.get("balance") ?? 0));
  await prisma.finAccount.updateMany({ where: { id, userId }, data: { balance: BigInt(balance) } });
  revalidatePath("/money");
  revalidatePath("/");
  redirect("/money?ok=" + encodeURIComponent("Balance updated"));
}

/* ---------- debts ---------- */

export async function payDebtMonth(formData: FormData) {
  const userId = await requireUser();
  const debtId = String(formData.get("debtId") ?? "");
  const monthIso = String(formData.get("month") ?? "");
  const amount = Math.round(Number(formData.get("amount") ?? 0));
  const accountId = String(formData.get("accountId") ?? "") || null;
  const backTo = String(formData.get("backTo") ?? "/");

  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt || !monthIso || amount <= 0) redirect(backTo);
  const month = new Date(monthIso);

  const ops = [
    prisma.debtPayment.upsert({
      where: { debtId_month: { debtId, month } },
      create: { debtId, month, amount: BigInt(amount), status: "PAID" },
      update: { amount: BigInt(amount), status: "PAID", paidDate: new Date() },
    }),
  ];
  if (accountId) {
    const account = await prisma.finAccount.findFirst({ where: { id: accountId, userId } });
    if (account) {
      ops.push(
        prisma.transaction.create({
          data: {
            userId,
            accountId,
            amount: BigInt(amount),
            direction: "OUT",
            note: `Debt payment — ${debt.lender}`,
          },
        }) as never,
        prisma.finAccount.update({
          where: { id: accountId },
          data: { balance: { decrement: BigInt(amount) } },
        }) as never,
      );
    }
  }
  await prisma.$transaction(ops);

  // detect full payoff for the big celebration
  const [schedule, payments, adjustments] = await Promise.all([
    prisma.debtScheduleEntry.aggregate({ where: { debtId }, _sum: { planned: true } }),
    prisma.debtPayment.aggregate({ where: { debtId }, _sum: { amount: true } }),
    prisma.debtAdjustment.aggregate({ where: { debtId }, _sum: { delta: true } }),
  ]);
  const remaining =
    Number(schedule._sum.planned ?? 0n) +
    Number(adjustments._sum.delta ?? 0n) -
    Number(payments._sum.amount ?? 0n);
  const lunas = remaining <= 0;
  if (lunas) {
    await prisma.debt.update({ where: { id: debtId }, data: { status: "PAID_OFF" } });
  }

  revalidatePath("/");
  revalidatePath("/debts");
  revalidatePath(`/debts/${debtId}`);
  const msg = lunas ? `${debt.lender} is fully paid — LUNAS! 🎉` : `${debt.lender} payment recorded ✓`;
  redirect(`${backTo}?ok=${encodeURIComponent(msg)}&fx=${lunas ? "lunas" : "paid"}`);
}

export async function adjustDebt(formData: FormData) {
  const userId = await requireUser();
  const debtId = String(formData.get("debtId") ?? "");
  const delta = Math.round(Number(formData.get("delta") ?? 0));
  const reason = String(formData.get("reason") ?? "");
  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt || !delta) redirect(`/debts/${debtId}`);
  await prisma.debtAdjustment.create({
    data: { debtId, month: monthKey(), delta: BigInt(delta), reason },
  });
  revalidatePath("/");
  revalidatePath("/debts");
  revalidatePath(`/debts/${debtId}`);
  redirect(`/debts/${debtId}?ok=` + encodeURIComponent("Adjustment applied ⚖️"));
}

/* ---------- settings ---------- */

export async function updateSettings(formData: FormData) {
  const userId = await requireUser();
  const num = (k: string) => Math.round(Number(formData.get(k) ?? 0));
  const flt = (k: string) => Number(formData.get(k) ?? 0);
  await prisma.settings.upsert({
    where: { userId },
    create: {
      userId,
      monthlyIncome: BigInt(num("monthlyIncome")),
      livingRent: BigInt(num("livingRent")),
      livingFood: BigInt(num("livingFood")),
      livingFamily: BigInt(num("livingFamily")),
      livingOther: BigInt(num("livingOther")),
      salaryGrowthPct: flt("salaryGrowthPct"),
      inflationPct: flt("inflationPct"),
      savingsRatePct: flt("savingsRatePct"),
    },
    update: {
      monthlyIncome: BigInt(num("monthlyIncome")),
      livingRent: BigInt(num("livingRent")),
      livingFood: BigInt(num("livingFood")),
      livingFamily: BigInt(num("livingFamily")),
      livingOther: BigInt(num("livingOther")),
      salaryGrowthPct: flt("salaryGrowthPct"),
      inflationPct: flt("inflationPct"),
      savingsRatePct: flt("savingsRatePct"),
    },
  });
  revalidatePath("/future");
  revalidatePath("/");
  redirect("/future?ok=" + encodeURIComponent("Assumptions saved"));
}
