"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { ensurePersonalSpace, requireSpace } from "@/lib/space";
import { createSession, destroySession, getSessionUserId } from "@/lib/auth";
import { monthKey } from "@/lib/format";



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
  // every user starts with a private personal space
  const personalSpaceId = await ensurePersonalSpace(user.id);
  await prisma.settings.create({ data: { userId: user.id } });
  await prisma.finAccount.create({
    data: { userId: user.id, spaceId: personalSpaceId, name: "Cash", type: "CASH", balance: 0n },
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
    ).map((c) => ({ userId: user.id, spaceId: personalSpaceId, ...c })),
  });
  await createSession(user.id);
  redirect("/?ok=" + encodeURIComponent(`Welcome to SmartSaku, ${name}! 🌱`));
}

/* ---------- money ---------- */

export async function addTransaction(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
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
      data: { userId, spaceId, accountId, categoryId, amount: BigInt(amount), direction, note },
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
  const { userId, spaceId } = await requireSpace();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "BANK") as "BANK" | "SAVINGS" | "EWALLET" | "CASH";
  const balance = Math.round(Number(formData.get("balance") ?? 0));
  const backTo = String(formData.get("backTo") ?? "/money");
  if (!name) redirect(backTo);
  await prisma.finAccount.create({ data: { userId, spaceId, name, type, balance: BigInt(balance) } });
  revalidatePath("/", "layout");
  redirect(`${backTo}?ok=` + encodeURIComponent(`Account "${name}" created`));
}

export async function updateAccountBalance(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("accountId") ?? "");
  const balance = Math.round(Number(formData.get("balance") ?? 0));
  await prisma.finAccount.updateMany({ where: { id, spaceId }, data: { balance: BigInt(balance) } });
  revalidatePath("/money");
  revalidatePath("/");
  redirect("/money?ok=" + encodeURIComponent("Balance updated"));
}

export async function transferBetweenAccounts(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const fromId = String(formData.get("fromAccountId") ?? "");
  const toId = String(formData.get("toAccountId") ?? "");
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const note = String(formData.get("note") ?? "").trim();
  const back = "/money/transfer";

  if (!amount) redirect(`${back}?err=` + encodeURIComponent("Please fill the amount"));
  if (fromId === toId) {
    redirect(`${back}?err=` + encodeURIComponent("Choose two different accounts"));
  }
  const [from, to] = await Promise.all([
    prisma.finAccount.findFirst({ where: { id: fromId, userId, archived: false } }),
    prisma.finAccount.findFirst({ where: { id: toId, userId, archived: false } }),
  ]);
  if (!from || !to) redirect(`${back}?err=` + encodeURIComponent("Choose both accounts"));

  const transferId = randomUUID();
  const label = note || `Transfer ${from!.name} → ${to!.name}`;
  await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId,
        accountId: from!.id,
        amount: BigInt(amount),
        direction: "OUT",
        note: label,
        transferId,
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        accountId: to!.id,
        amount: BigInt(amount),
        direction: "IN",
        note: label,
        transferId,
      },
    }),
    prisma.finAccount.update({
      where: { id: from!.id },
      data: { balance: { decrement: BigInt(amount) } },
    }),
    prisma.finAccount.update({
      where: { id: to!.id },
      data: { balance: { increment: BigInt(amount) } },
    }),
  ]);
  revalidatePath("/", "layout");
  redirect(
    "/money?tab=history&ok=" +
      encodeURIComponent(`Moved money from ${from!.name} to ${to!.name} ⇄`),
  );
}

export async function updateTransaction(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const direction = formData.get("direction") === "IN" ? "IN" : "OUT";
  const accountId = String(formData.get("accountId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const note = String(formData.get("note") ?? "");
  const dateRaw = String(formData.get("date") ?? "");
  const backTo = String(formData.get("backTo") ?? "/money?tab=history");

  const old = await prisma.transaction.findFirst({ where: { id, spaceId } });
  const newAccount = await prisma.finAccount.findFirst({ where: { id: accountId, userId } });
  if (!old || !newAccount || !amount) {
    redirect(`${backTo}&err=` + encodeURIComponent("Could not update the transaction"));
  }
  const date = dateRaw ? new Date(dateRaw + "T08:00:00Z") : old!.date;
  const oldEffect = old!.direction === "IN" ? old!.amount : -old!.amount;
  const newEffect = BigInt(direction === "IN" ? amount : -amount);

  await prisma.$transaction([
    prisma.finAccount.update({
      where: { id: old!.accountId },
      data: { balance: { decrement: oldEffect } },
    }),
    prisma.finAccount.update({
      where: { id: newAccount!.id },
      data: { balance: { increment: newEffect } },
    }),
    prisma.transaction.update({
      where: { id },
      data: { amount: BigInt(amount), direction, accountId, categoryId, note, date },
    }),
    prisma.debtPayment.updateMany({
      where: { transactionId: id },
      data: { amount: BigInt(amount) },
    }),
    prisma.goalContribution.updateMany({
      where: { transactionId: id },
      data: { amount: BigInt(amount) },
    }),
  ]);
  revalidatePath("/", "layout");
  redirect(`${backTo}&ok=` + encodeURIComponent("Transaction updated"));
}

export async function deleteTransaction(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const backTo = String(formData.get("backTo") ?? "/money?tab=history");
  const old = await prisma.transaction.findFirst({ where: { id, spaceId } });
  if (!old) redirect(`${backTo}&err=` + encodeURIComponent("Transaction not found"));
  if (old!.transferId) {
    const legs = await prisma.transaction.findMany({
      where: { spaceId, transferId: old!.transferId },
    });
    await prisma.$transaction(async (tx) => {
      for (const leg of legs) {
        await tx.finAccount.update({
          where: { id: leg.accountId },
          data: {
            balance: { [leg.direction === "IN" ? "decrement" : "increment"]: leg.amount },
          },
        });
      }
      await tx.transaction.deleteMany({ where: { spaceId, transferId: old!.transferId } });
    });
    revalidatePath("/", "layout");
    redirect(`${backTo}&ok=` + encodeURIComponent("Transfer undone on both accounts"));
  }

  const effect = old!.direction === "IN" ? old!.amount : -old!.amount;
  const [linkedPayment, linkedContribution] = await Promise.all([
    prisma.debtPayment.findFirst({ where: { transactionId: id }, include: { debt: true } }),
    prisma.goalContribution.findFirst({ where: { transactionId: id } }),
  ]);
  await prisma.$transaction(async (tx) => {
    await tx.finAccount.update({
      where: { id: old!.accountId },
      data: { balance: { decrement: effect } },
    });
    if (linkedPayment) {
      await tx.debtPayment.delete({ where: { id: linkedPayment.id } });
      await tx.debt.updateMany({
        where: { id: linkedPayment.debtId, status: "PAID_OFF" },
        data: { status: "ACTIVE" },
      });
    }
    if (linkedContribution) {
      await tx.goalContribution.delete({ where: { id: linkedContribution.id } });
    }
    await tx.transaction.delete({ where: { id } });
  });
  revalidatePath("/", "layout");
  const msg = linkedPayment
    ? `Deleted — balance restored and ${linkedPayment.debt.lender} reopened`
    : linkedContribution
      ? "Deleted — balance restored and the goal contribution removed"
      : "Transaction deleted — balance restored";
  redirect(`${backTo}&ok=` + encodeURIComponent(msg));
}

/* ---------- debts ---------- */

export async function payDebtMonth(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const debtId = String(formData.get("debtId") ?? "");
  const monthIso = String(formData.get("month") ?? "");
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const accountId = String(formData.get("accountId") ?? "") || null;
  const backTo = String(formData.get("backTo") ?? "/");

  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt || !monthIso || amount <= 0) redirect(backTo);
  const month = new Date(monthIso);

  const account = await prisma.finAccount.findFirst({
    where: { id: accountId ?? "", userId, archived: false },
  });
  if (!account) {
    redirect(`${backTo}?err=` + encodeURIComponent("Choose which account to pay from"));
  }
  const debtCategory = await prisma.category.upsert({
    where: { spaceId_name_type: { spaceId, name: "Debt", type: "EXPENSE" } },
    create: { userId, spaceId, name: "Debt", type: "EXPENSE", icon: "🏦" },
    update: {},
  });

  let monthFullyPaid = false;
  let paidNothing = false;
  await prisma.$transaction(async (tx) => {
    const [entry, monthPaidAgg, totalPlannedAgg, totalPaidAgg, adjAgg] = await Promise.all([
      tx.debtScheduleEntry.findFirst({ where: { debtId, month } }),
      tx.debtPayment.aggregate({ where: { debtId, month }, _sum: { amount: true } }),
      tx.debtScheduleEntry.aggregate({ where: { debtId }, _sum: { planned: true } }),
      tx.debtPayment.aggregate({ where: { debtId }, _sum: { amount: true } }),
      tx.debtAdjustment.aggregate({ where: { debtId }, _sum: { delta: true } }),
    ]);
    const planned = Number(entry?.planned ?? 0n);
    const alreadyPaid = Number(monthPaidAgg._sum.amount ?? 0n);
    const totalRemaining =
      Number(totalPlannedAgg._sum.planned ?? 0n) +
      Number(adjAgg._sum.delta ?? 0n) -
      Number(totalPaidAgg._sum.amount ?? 0n);
    const dueLeft = Math.min(planned - alreadyPaid, totalRemaining);
    if (dueLeft <= 0) {
      paidNothing = true;
      return;
    }
    const payAmount = Math.min(amount, dueLeft);
    monthFullyPaid = alreadyPaid + payAmount >= planned;

    const created = await tx.transaction.create({
      data: {
        userId,
        accountId: account!.id,
        categoryId: debtCategory.id,
        amount: BigInt(payAmount),
        direction: "OUT",
        note: `Debt payment — ${debt.lender}`,
      },
    });
    await tx.finAccount.update({
      where: { id: account!.id },
      data: { balance: { decrement: BigInt(payAmount) } },
    });
    await tx.debtPayment.create({
      data: {
        debtId,
        month,
        amount: BigInt(payAmount),
        status: monthFullyPaid ? "PAID" : "PARTIAL",
        transactionId: created.id,
      },
    });
  });
  if (paidNothing) {
    redirect(`${backTo}?err=` + encodeURIComponent("This month is already fully paid"));
  }

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
  const msg = lunas
    ? `${debt.lender} is fully paid — LUNAS! 🎉`
    : monthFullyPaid
      ? `${debt.lender} payment recorded ✓`
      : `Partial payment recorded — ${debt.lender} still needs more this month`;
  redirect(`${backTo}?ok=${encodeURIComponent(msg)}&fx=${lunas ? "lunas" : "paid"}`);
}

export async function adjustDebt(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
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

const DEBT_COLORS = ["#C96F4A", "#31694E", "#BBC863", "#827148", "#E8A07C", "#658C58", "#C79A3D"];

export async function addDebt(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const lender = String(formData.get("lender") ?? "").trim();
  const total = Math.abs(Math.round(Number(formData.get("total") ?? 0)));
  const monthly = Math.abs(Math.round(Number(formData.get("monthly") ?? 0)));
  const startRaw = String(formData.get("start") ?? "");
  if (!lender || !total || !monthly) {
    redirect("/money?tab=debts&err=" + encodeURIComponent("Please fill name, total, and monthly amount"));
  }
  const exists = await prisma.debt.findFirst({ where: { spaceId, lender } });
  if (exists) {
    redirect("/money?tab=debts&err=" + encodeURIComponent(`"${lender}" already exists`));
  }
  const now = new Date();
  const [sy, sm] = startRaw.split("-").map(Number);
  const start = sy && sm ? new Date(Date.UTC(sy, sm - 1, 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const count = await prisma.debt.count({ where: { spaceId } });
  const debt = await prisma.debt.create({
    data: { userId, spaceId, lender, color: DEBT_COLORS[count % DEBT_COLORS.length] },
  });
  const rows = [];
  let left = total;
  for (let i = 0; i < 120 && left > 0; i++) {
    const planned = Math.min(monthly, left);
    rows.push({
      debtId: debt.id,
      month: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)),
      planned: BigInt(planned),
    });
    left -= planned;
  }
  if (left > 0 && rows.length > 0) {
    rows[rows.length - 1].planned += BigInt(left);
  }
  await prisma.debtScheduleEntry.createMany({ data: rows });
  revalidatePath("/", "layout");
  redirect(
    `/debts/${debt.id}?ok=` +
      encodeURIComponent(`"${lender}" added — ${rows.length} monthly payments scheduled`),
  );
}

export async function updateScheduleEntry(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const entryId = String(formData.get("entryId") ?? "");
  const planned = Math.abs(Math.round(Number(formData.get("planned") ?? 0)));
  const entry = await prisma.debtScheduleEntry.findFirst({
    where: { id: entryId, debt: { spaceId } },
  });
  if (!entry) redirect("/money?tab=debts");
  if (!planned) {
    redirect(`/debts/${entry!.debtId}?err=` + encodeURIComponent("Amount must be above zero — use Remove month instead"));
  }
  await prisma.debtScheduleEntry.update({ where: { id: entryId }, data: { planned: BigInt(planned) } });
  revalidatePath("/", "layout");
  redirect(`/debts/${entry!.debtId}?ok=` + encodeURIComponent("Installment updated — forecast recalculated"));
}

export async function deleteScheduleEntry(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const entryId = String(formData.get("entryId") ?? "");
  const entry = await prisma.debtScheduleEntry.findFirst({
    where: { id: entryId, debt: { spaceId } },
  });
  if (!entry) redirect("/money?tab=debts");
  await prisma.debtScheduleEntry.delete({ where: { id: entryId } });
  revalidatePath("/", "layout");
  redirect(`/debts/${entry!.debtId}?ok=` + encodeURIComponent("Month removed from the schedule"));
}

export async function addScheduleEntry(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const debtId = String(formData.get("debtId") ?? "");
  const planned = Math.abs(Math.round(Number(formData.get("planned") ?? 0)));
  const monthRaw = String(formData.get("month") ?? "");
  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  const [y, m] = monthRaw.split("-").map(Number);
  if (!debt || !planned || !y || !m) {
    redirect(`/debts/${debtId}?err=` + encodeURIComponent("Please pick a month and an amount"));
  }
  const month = new Date(Date.UTC(y!, m! - 1, 1));
  const exists = await prisma.debtScheduleEntry.findFirst({ where: { debtId, month } });
  if (exists) {
    redirect(`/debts/${debtId}?err=` + encodeURIComponent("That month is already scheduled — edit it instead"));
  }
  await prisma.debtScheduleEntry.create({ data: { debtId, month, planned: BigInt(planned) } });
  revalidatePath("/", "layout");
  redirect(`/debts/${debtId}?ok=` + encodeURIComponent("Month added to the schedule"));
}

export async function renameDebt(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const debtId = String(formData.get("debtId") ?? "");
  const lender = String(formData.get("lender") ?? "").trim();
  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt) redirect("/money?tab=debts");
  if (!lender) {
    redirect(`/debts/${debtId}?err=` + encodeURIComponent("Name cannot be empty"));
  }
  const conflict = await prisma.debt.findFirst({
    where: { spaceId, lender, NOT: { id: debtId } },
  });
  if (conflict) {
    redirect(`/debts/${debtId}?err=` + encodeURIComponent(`"${lender}" already exists`));
  }
  await prisma.debt.update({ where: { id: debtId }, data: { lender } });
  revalidatePath("/", "layout");
  redirect(`/debts/${debtId}?ok=` + encodeURIComponent("Debt renamed"));
}

export async function deleteDebt(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const debtId = String(formData.get("debtId") ?? "");
  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt) redirect("/money?tab=debts");
  await prisma.debt.delete({ where: { id: debtId } });
  revalidatePath("/", "layout");
  redirect(
    "/money?tab=debts&ok=" +
      encodeURIComponent(`"${debt!.lender}" deleted — past bank transactions are kept`),
  );
}

export async function updateDebtPayment(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const paymentId = String(formData.get("paymentId") ?? "");
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const owned = await prisma.debtPayment.findFirst({
    where: { id: paymentId, debt: { spaceId } },
  });
  if (!owned || !amount) redirect("/money?tab=debts");
  const backTo = `/debts/${owned!.debtId}`;

  let overCap = 0;
  await prisma.$transaction(async (tx) => {
    const payment = await tx.debtPayment.findUnique({ where: { id: paymentId } });
    if (!payment) return;
    const [entry, othersAgg] = await Promise.all([
      tx.debtScheduleEntry.findFirst({ where: { debtId: payment.debtId, month: payment.month } }),
      tx.debtPayment.aggregate({
        where: { debtId: payment.debtId, month: payment.month, NOT: { id: paymentId } },
        _sum: { amount: true },
      }),
    ]);
    const planned = Number(entry?.planned ?? 0n);
    const others = Number(othersAgg._sum.amount ?? 0n);
    if (planned > 0 && amount + others > planned) {
      overCap = planned - others;
      return;
    }
    const diff = BigInt(amount) - payment.amount;
    await tx.debtPayment.update({ where: { id: paymentId }, data: { amount: BigInt(amount) } });
    if (payment.transactionId) {
      const linked = await tx.transaction.findUnique({ where: { id: payment.transactionId } });
      if (linked) {
        await tx.transaction.update({
          where: { id: linked.id },
          data: { amount: BigInt(amount) },
        });
        await tx.finAccount.update({
          where: { id: linked.accountId },
          data: { balance: { decrement: diff } },
        });
      }
    }
  });
  if (overCap > 0) {
    redirect(
      `${backTo}?err=` +
        encodeURIComponent(
          `Too much — other payments already cover part of this month (max ${overCap.toLocaleString("en-US")})`,
        ),
    );
  }
  revalidatePath("/", "layout");
  redirect(`${backTo}?ok=` + encodeURIComponent("Payment updated — balances synced"));
}

export async function deleteDebtPayment(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const paymentId = String(formData.get("paymentId") ?? "");
  const payment = await prisma.debtPayment.findFirst({
    where: { id: paymentId, debt: { spaceId } },
  });
  if (!payment) redirect("/money?tab=debts");
  const backTo = `/debts/${payment!.debtId}`;

  await prisma.$transaction(async (tx) => {
    if (payment!.transactionId) {
      const linked = await tx.transaction.findUnique({ where: { id: payment!.transactionId } });
      if (linked) {
        await tx.finAccount.update({
          where: { id: linked.accountId },
          data: { balance: { increment: linked.amount } },
        });
        await tx.transaction.delete({ where: { id: linked.id } });
      }
    }
    await tx.debtPayment.delete({ where: { id: paymentId } });
    await tx.debt.updateMany({
      where: { id: payment!.debtId, status: "PAID_OFF" },
      data: { status: "ACTIVE" },
    });
  });
  revalidatePath("/", "layout");
  redirect(`${backTo}?ok=` + encodeURIComponent("Payment removed — money returned to account"));
}

export async function deleteDebtAdjustment(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const adj = await prisma.debtAdjustment.findFirst({ where: { id, debt: { spaceId } } });
  if (!adj) redirect("/money?tab=debts");
  await prisma.debtAdjustment.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect(`/debts/${adj!.debtId}?ok=` + encodeURIComponent("Adjustment removed"));
}

/* ---------- transaction plan ---------- */

export async function addPlanned(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const name = String(formData.get("name") ?? "").trim();
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const direction = formData.get("direction") === "IN" ? "IN" : "OUT";
  const dayOfMonth = Math.min(28, Math.max(1, Math.round(Number(formData.get("dayOfMonth") ?? 1))));
  const accountId = String(formData.get("accountId") ?? "") || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  if (!name || !amount) {
    redirect("/money?tab=plan&err=" + encodeURIComponent("Please fill the name and amount"));
  }
  if (accountId) {
    const owns = await prisma.finAccount.count({ where: { id: accountId, userId } });
    if (owns === 0) redirect("/money?tab=plan&err=" + encodeURIComponent("Unknown account"));
  }
  if (categoryId) {
    const owns = await prisma.category.count({ where: { id: categoryId, userId } });
    if (owns === 0) redirect("/money?tab=plan&err=" + encodeURIComponent("Unknown category"));
  }
  await prisma.plannedTransaction.create({
    data: { userId, spaceId, name, amount: BigInt(amount), direction, dayOfMonth, accountId, categoryId },
  });
  revalidatePath("/", "layout");
  redirect("/money?tab=plan&ok=" + encodeURIComponent(`"${name}" added to your plan`));
}

export async function updatePlanned(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const dayOfMonth = Math.min(28, Math.max(1, Math.round(Number(formData.get("dayOfMonth") ?? 1))));
  const accountId = String(formData.get("accountId") ?? "") || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const planned = await prisma.plannedTransaction.findFirst({ where: { id, spaceId } });
  if (!planned || !name || !amount) {
    redirect("/money?tab=plan&err=" + encodeURIComponent("Could not update the plan item"));
  }
  if (accountId) {
    const owns = await prisma.finAccount.count({ where: { id: accountId, userId } });
    if (owns === 0) redirect("/money?tab=plan&err=" + encodeURIComponent("Unknown account"));
  }
  if (categoryId) {
    const owns = await prisma.category.count({ where: { id: categoryId, userId } });
    if (owns === 0) redirect("/money?tab=plan&err=" + encodeURIComponent("Unknown category"));
  }
  await prisma.plannedTransaction.update({
    where: { id },
    data: { name, amount: BigInt(amount), dayOfMonth, accountId, categoryId },
  });
  revalidatePath("/", "layout");
  redirect("/money?tab=plan&ok=" + encodeURIComponent("Plan updated"));
}

export async function deletePlanned(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  await prisma.plannedTransaction.deleteMany({ where: { id, spaceId } });
  revalidatePath("/", "layout");
  redirect("/money?tab=plan&ok=" + encodeURIComponent("Removed from your plan"));
}

export async function recordPlanned(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const backTo = String(formData.get("backTo") ?? "/money?tab=plan");
  const planned = await prisma.plannedTransaction.findFirst({ where: { id, spaceId } });
  if (!planned) redirect(backTo);

  const now = monthKey();

  let accountId = planned!.accountId;
  if (accountId) {
    const owns = await prisma.finAccount.count({ where: { id: accountId, userId, archived: false } });
    if (owns === 0) accountId = null;
  }
  if (!accountId) {
    const first = await prisma.finAccount.findFirst({
      where: { spaceId, archived: false },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    });
    if (!first) redirect(`${backTo}&err=` + encodeURIComponent("Create an account first"));
    accountId = first!.id;
  }

  const effect = planned!.direction === "IN" ? planned!.amount : -planned!.amount;
  try {
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          accountId,
          categoryId: planned!.categoryId,
          amount: planned!.amount,
          direction: planned!.direction,
          note: planned!.name,
          plannedId: id,
          plannedMonth: now,
        },
      }),
      prisma.finAccount.update({
        where: { id: accountId },
        data: { balance: { increment: effect } },
      }),
    ]);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      redirect(`${backTo}&err=` + encodeURIComponent(`"${planned!.name}" is already recorded this month`));
    }
    throw e;
  }
  revalidatePath("/", "layout");
  if (planned!.direction === "IN") {
    redirect(`${backTo}&ok=` + encodeURIComponent(`"${planned!.name}" recorded 💰`) + "&fx=money");
  }
  redirect(`${backTo}&ok=` + encodeURIComponent(`"${planned!.name}" recorded ✓`));
}

/* ---------- settings ---------- */

export async function updateSettings(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
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
