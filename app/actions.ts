"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { nameFromEmail, setUpNewUser } from "@/lib/onboarding";
import { ensurePersonalSpace, requireOwner, requireSpace } from "@/lib/space";
import { createSession, destroySession, getSessionUserId, safeBackTo } from "@/lib/auth";
import { addMonths, formatMinor, monthKey } from "@/lib/format";
import { parseWhen, recordTransaction } from "@/lib/tx";
import { toNum } from "@/lib/validate";
import { logAudit } from "@/lib/audit";
import { PLANS, type Tier } from "@/lib/plan";
import { createSnapTransaction, midtransConfigured } from "@/lib/midtrans";



/* ---------- auth ---------- */

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const perIp = await rateLimit(await clientKey("login"), 10, 300);
  if (!perIp.ok) redirect("/login?error=rate");
  const perAccount = await rateLimit(`login:email:${email}`, 5, 300);
  if (!perAccount.ok) redirect("/login?error=rate");

  const user = await prisma.user.findUnique({ where: { email } });
  // an account created through Google has no password to compare against
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    redirect("/login?error=1");
  }
  await createSession(user!.id);
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

  const limit = await rateLimit(await clientKey("register"), 5, 3600);
  if (!limit.ok) redirect("/register?error=rate");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/register?error=email");
  if (password.length < 8) redirect("/register?error=short");
  if (password !== confirm) redirect("/register?error=match");
  if (await prisma.user.findUnique({ where: { email } })) redirect("/register?error=exists");

  const name = nameFromEmail(email);
  const user = await prisma.user.create({
    data: { email, name, passwordHash: await bcrypt.hash(password, 10) },
  });
  await setUpNewUser(user.id);
  await createSession(user.id);
  redirect("/?ok=" + encodeURIComponent(`Welcome to SmartSaku, ${name}! 🌱`));
}

/* ---------- money ---------- */

export async function addTransaction(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const amount = Math.abs(Math.round(toNum(formData.get("amount") ?? 0)));
  const direction = formData.get("direction") === "IN" ? "IN" : "OUT";
  const accountId = String(formData.get("accountId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const note = String(formData.get("note") ?? "");
  const date = parseWhen(formData.get("date"));

  const result = await recordTransaction(userId, spaceId, {
    amount,
    direction,
    accountId,
    categoryId,
    note,
    date,
  });
  if (!result.ok) redirect("/add?error=1");

  if (formData.get("saveAsTemplate") === "1") {
    const fallback = note.trim() || (direction === "IN" ? "Income" : "Expense");
    const tName = (String(formData.get("templateName") ?? "").trim() || fallback).slice(0, 40);
    const tEmoji = (String(formData.get("templateEmoji") ?? "").trim() || "⭐").slice(0, 8);
    const count = await prisma.transactionTemplate.count({ where: { spaceId } });
    await prisma.transactionTemplate.create({
      data: {
        userId,
        spaceId,
        name: tName,
        emoji: tEmoji,
        direction,
        amount: BigInt(amount),
        categoryId,
        accountId,
        note,
        sortOrder: count,
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/money");
  revalidatePath("/add");
  if (direction === "IN") {
    redirect("/money?ok=" + encodeURIComponent("Income recorded 💰") + "&fx=money");
  }
  redirect("/money?ok=" + encodeURIComponent("Expense saved"));
}

export async function addAccount(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "BANK") as "BANK" | "SAVINGS" | "EWALLET" | "CASH";
  const balance = Math.round(toNum(formData.get("balance") ?? 0));
  const backTo = safeBackTo(formData.get("backTo"), "/money");
  if (!name) redirect(backTo);
  await prisma.finAccount.create({ data: { userId, spaceId, name, type, balance: BigInt(balance) } });
  revalidatePath("/", "layout");
  redirect(`${backTo}?ok=` + encodeURIComponent(`Account "${name}" created`));
}

export async function updateAccountBalance(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("accountId") ?? "");
  const balance = Math.round(toNum(formData.get("balance") ?? 0));
  const mode = String(formData.get("mode") ?? "record");
  const reason = String(formData.get("reason") ?? "").trim();
  const backTo = safeBackTo(formData.get("backTo"), "/settings/accounts");

  // the balance is read and written inside one transaction with the row locked,
  // so a payment landing at the same moment cannot be silently overwritten
  const outcome = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ balance: bigint }[]>`
      SELECT "balance" FROM "FinAccount"
      WHERE "id" = ${id} AND "spaceId" = ${spaceId}
      FOR UPDATE
    `;
    if (locked.length === 0) return { status: "missing" as const };

    const before = Number(locked[0].balance);
    const diff = balance - before;
    if (diff === 0) return { status: "unchanged" as const };

    if (mode === "correct") {
      // silent fix: no transaction, but keep a record of what changed
      await tx.finAccount.update({ where: { id }, data: { balance: BigInt(balance) } });
      await tx.balanceCorrection.create({
        data: { accountId: id, userId, before: BigInt(before), after: BigInt(balance), reason },
      });
      return { status: "corrected" as const, diff };
    }

    // default: make the difference visible as a real transaction
    await tx.transaction.create({
      data: {
        userId,
        spaceId,
        accountId: id,
        amount: BigInt(Math.abs(diff)),
        direction: diff > 0 ? "IN" : "OUT",
        note: reason || "Balance adjustment",
        kind: "BALANCE_ADJUSTMENT",
      },
    });
    await tx.finAccount.update({ where: { id }, data: { balance: BigInt(balance) } });
    return { status: "recorded" as const, diff };
  });

  if (outcome.status === "missing") {
    redirect(`${backTo}?err=` + encodeURIComponent("Account not found"));
  }
  if (outcome.status === "unchanged") {
    redirect(`${backTo}?ok=` + encodeURIComponent("Balance unchanged"));
  }
  if (outcome.status === "corrected") {
    redirect(`${backTo}?ok=` + encodeURIComponent("Balance corrected — logged for audit"));
  }
  const diff = outcome.diff;
  redirect(
    `${backTo}?ok=` +
      encodeURIComponent(
        `Recorded ${diff > 0 ? "income" : "expense"} of ${formatMinor(Math.abs(diff))}`,
      ),
  );
}

export async function setPrimaryAccount(formData: FormData) {
  const { spaceId } = await requireSpace();
  const id = String(formData.get("accountId") ?? "");
  const account = await prisma.finAccount.findFirst({ where: { id, spaceId } });
  if (!account) redirect("/settings/accounts?err=" + encodeURIComponent("Account not found"));
  await prisma.$transaction([
    prisma.finAccount.updateMany({ where: { spaceId }, data: { primary: false } }),
    prisma.finAccount.update({ where: { id }, data: { primary: true } }),
  ]);
  revalidatePath("/", "layout");
  redirect("/settings/accounts?ok=" + encodeURIComponent(`${account!.name} is now your main account`));
}

export async function toggleAccountHidden(formData: FormData) {
  const { spaceId } = await requireSpace();
  const id = String(formData.get("accountId") ?? "");
  const account = await prisma.finAccount.findFirst({ where: { id, spaceId } });
  if (!account) redirect("/settings/accounts?err=" + encodeURIComponent("Account not found"));
  const hidden = !account!.hidden;
  await prisma.finAccount.update({ where: { id }, data: { hidden } });
  revalidatePath("/", "layout");
  redirect(
    "/settings/accounts?ok=" +
      encodeURIComponent(
        hidden
          ? `${account!.name} is hidden — left out of totals and charts`
          : `${account!.name} counts towards your totals again`,
      ),
  );
}

export async function reorderAccounts(formData: FormData) {
  const { spaceId } = await requireSpace();
  const ids = String(formData.get("order") ?? "").split(",").filter(Boolean);
  if (!ids.length) redirect("/settings/accounts");
  const owned = await prisma.finAccount.findMany({ where: { spaceId }, select: { id: true } });
  const allowed = new Set(owned.map((a) => a.id));
  if (ids.some((id) => !allowed.has(id))) {
    redirect("/settings/accounts?err=" + encodeURIComponent("That order does not match your accounts"));
  }
  await prisma.$transaction(
    ids.map((id, i) => prisma.finAccount.update({ where: { id }, data: { sortOrder: i } })),
  );
  revalidatePath("/", "layout");
  redirect("/settings/accounts?ok=" + encodeURIComponent("Order saved"));
}

export async function transferBetweenAccounts(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const fromId = String(formData.get("fromAccountId") ?? "");
  const toId = String(formData.get("toAccountId") ?? "");
  const amount = Math.abs(Math.round(toNum(formData.get("amount") ?? 0)));
  const note = String(formData.get("note") ?? "").trim();
  const back = "/money/transfer";

  if (!amount) redirect(`${back}?err=` + encodeURIComponent("Please fill the amount"));
  if (fromId === toId) {
    redirect(`${back}?err=` + encodeURIComponent("Choose two different accounts"));
  }
  const [from, to] = await Promise.all([
    prisma.finAccount.findFirst({ where: { id: fromId, spaceId, archived: false } }),
    prisma.finAccount.findFirst({ where: { id: toId, spaceId, archived: false } }),
  ]);
  if (!from || !to) redirect(`${back}?err=` + encodeURIComponent("Choose both accounts"));

  const transferId = randomUUID();
  const label = note || `Transfer ${from!.name} → ${to!.name}`;
  const when = parseWhen(formData.get("date"));
  await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId,
        spaceId,
        accountId: from!.id,
        amount: BigInt(amount),
        direction: "OUT",
        kind: "TRANSFER",
        note: label,
        transferId,
        ...(when ? { date: when } : {}),
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        spaceId,
        accountId: to!.id,
        amount: BigInt(amount),
        direction: "IN",
        kind: "TRANSFER",
        note: label,
        transferId,
        ...(when ? { date: when } : {}),
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
  const amount = Math.abs(Math.round(toNum(formData.get("amount") ?? 0)));
  const direction = formData.get("direction") === "IN" ? "IN" : "OUT";
  const accountId = String(formData.get("accountId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const note = String(formData.get("note") ?? "");
  const dateRaw = String(formData.get("date") ?? "");
  const backTo = safeBackTo(formData.get("backTo"), "/money?tab=history");

  const old = await prisma.transaction.findFirst({ where: { id, spaceId } });
  const newAccount = await prisma.finAccount.findFirst({ where: { id: accountId, spaceId } });
  if (!old || !newAccount || !amount) {
    redirect(`${backTo}&err=` + encodeURIComponent("Could not update the transaction"));
  }
  // a transfer is a linked pair; editing one leg here would desync it. Deleting
  // it (which removes both legs) is the only safe change from this screen.
  if (old!.transferId || old!.kind === "TRANSFER") {
    redirect(`${backTo}&err=` + encodeURIComponent("A transfer cannot be edited — delete it and make a new one"));
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
  const backTo = safeBackTo(formData.get("backTo"), "/money?tab=history");
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
  const amount = Math.abs(Math.round(toNum(formData.get("amount") ?? 0)));
  const accountId = String(formData.get("accountId") ?? "") || null;
  const backTo = safeBackTo(formData.get("backTo"), "/");

  const debt = await prisma.debt.findFirst({ where: { id: debtId, spaceId } });
  if (!debt || !monthIso || amount <= 0) redirect(backTo);
  const month = new Date(monthIso);

  const account = await prisma.finAccount.findFirst({
    where: { id: accountId ?? "", spaceId, archived: false },
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
    // lock the debt row first: two quick submits must not both pass the cap check
    await tx.$queryRaw`SELECT "id" FROM "Debt" WHERE "id" = ${debtId} FOR UPDATE`;
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
        spaceId,
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
  const delta = Math.round(toNum(formData.get("delta") ?? 0));
  const reason = String(formData.get("reason") ?? "");
  const debt = await prisma.debt.findFirst({ where: { id: debtId, spaceId } });
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
  const total = Math.abs(Math.round(toNum(formData.get("total") ?? 0)));
  const monthly = Math.abs(Math.round(toNum(formData.get("monthly") ?? 0)));
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
  const aprPct = Math.max(0, toNum(formData.get("aprPct") ?? 0)) || 0;
  const minPayment = Math.abs(Math.round(toNum(formData.get("minPayment") ?? 0))) || monthly;
  const kind = String(formData.get("kind") ?? "other").slice(0, 20) || "other";
  const count = await prisma.debt.count({ where: { spaceId } });
  const debt = await prisma.debt.create({
    data: {
      userId,
      spaceId,
      lender,
      color: DEBT_COLORS[count % DEBT_COLORS.length],
      aprPct,
      minPayment: BigInt(minPayment),
      kind,
    },
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
  const planned = Math.abs(Math.round(toNum(formData.get("planned") ?? 0)));
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
  const planned = Math.abs(Math.round(toNum(formData.get("planned") ?? 0)));
  const monthRaw = String(formData.get("month") ?? "");
  const debt = await prisma.debt.findFirst({ where: { id: debtId, spaceId } });
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
  const debt = await prisma.debt.findFirst({ where: { id: debtId, spaceId } });
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

export async function updateDebtDetails(formData: FormData) {
  const { spaceId } = await requireSpace();
  const debtId = String(formData.get("debtId") ?? "");
  const debt = await prisma.debt.findFirst({ where: { id: debtId, spaceId } });
  if (!debt) redirect("/money?tab=debts");
  const aprPct = Math.min(1000, Math.max(0, toNum(formData.get("aprPct") ?? 0))) || 0;
  const minPayment = Math.abs(Math.round(toNum(formData.get("minPayment") ?? 0)));
  const kind = String(formData.get("kind") ?? "other").slice(0, 20) || "other";
  await prisma.debt.update({
    where: { id: debtId },
    data: { aprPct, minPayment: BigInt(minPayment), kind },
  });
  revalidatePath("/", "layout");
  redirect(`/debts/${debtId}?ok=` + encodeURIComponent("Loan details updated"));
}

export async function deleteDebt(formData: FormData) {
  const { userId, spaceId } = await requireOwner("/money?tab=debts");
  const debtId = String(formData.get("debtId") ?? "");
  const debt = await prisma.debt.findFirst({ where: { id: debtId, spaceId } });
  if (!debt) redirect("/money?tab=debts");
  await logAudit(userId, spaceId, "delete_debt", `Deleted debt "${debt!.lender}"`);
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
  const amount = Math.abs(Math.round(toNum(formData.get("amount") ?? 0)));
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
          `Too much — other payments already cover part of this month (max ${formatMinor(overCap)})`,
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

/** "none" = repeats forever; otherwise the number of months it runs for */
function planWindow(formData: FormData): { startMonth: Date; endMonth: Date | null } {
  const startMonth = monthKey();
  const raw = String(formData.get("repeatMonths") ?? "none");
  if (raw === "none") return { startMonth, endMonth: null };
  const months = Math.min(600, Math.max(1, Math.round(Number(raw) || 1)));
  return { startMonth, endMonth: addMonths(startMonth, months - 1) };
}

export async function addPlanned(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const name = String(formData.get("name") ?? "").trim();
  const amount = Math.abs(Math.round(toNum(formData.get("amount") ?? 0)));
  const direction = formData.get("direction") === "IN" ? "IN" : "OUT";
  const dayOfMonth = Math.min(28, Math.max(1, Math.round(toNum(formData.get("dayOfMonth") ?? 1))));
  const accountId = String(formData.get("accountId") ?? "") || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  if (!name || !amount) {
    redirect("/money?tab=plan&err=" + encodeURIComponent("Please fill the name and amount"));
  }
  if (accountId) {
    const owns = await prisma.finAccount.count({ where: { id: accountId, spaceId } });
    if (owns === 0) redirect("/money?tab=plan&err=" + encodeURIComponent("Unknown account"));
  }
  if (categoryId) {
    const owns = await prisma.category.count({ where: { id: categoryId, spaceId } });
    if (owns === 0) redirect("/money?tab=plan&err=" + encodeURIComponent("Unknown category"));
  }
  const { startMonth, endMonth } = planWindow(formData);
  await prisma.plannedTransaction.create({
    data: {
      userId,
      spaceId,
      name,
      amount: BigInt(amount),
      direction,
      dayOfMonth,
      accountId,
      categoryId,
      startMonth,
      endMonth,
    },
  });
  revalidatePath("/", "layout");
  redirect("/money?tab=plan&ok=" + encodeURIComponent(`"${name}" added to your plan`));
}

export async function updatePlanned(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const amount = Math.abs(Math.round(toNum(formData.get("amount") ?? 0)));
  const dayOfMonth = Math.min(28, Math.max(1, Math.round(toNum(formData.get("dayOfMonth") ?? 1))));
  const accountId = String(formData.get("accountId") ?? "") || null;
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const planned = await prisma.plannedTransaction.findFirst({ where: { id, spaceId } });
  if (!planned || !name || !amount) {
    redirect("/money?tab=plan&err=" + encodeURIComponent("Could not update the plan item"));
  }
  if (accountId) {
    const owns = await prisma.finAccount.count({ where: { id: accountId, spaceId } });
    if (owns === 0) redirect("/money?tab=plan&err=" + encodeURIComponent("Unknown account"));
  }
  if (categoryId) {
    const owns = await prisma.category.count({ where: { id: categoryId, spaceId } });
    if (owns === 0) redirect("/money?tab=plan&err=" + encodeURIComponent("Unknown category"));
  }
  const window = planWindow(formData);
  await prisma.plannedTransaction.update({
    where: { id },
    data: {
      name,
      amount: BigInt(amount),
      dayOfMonth,
      accountId,
      categoryId,
      // keep the original start; only the end can be re-chosen
      endMonth: window.endMonth,
    },
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
  const backTo = safeBackTo(formData.get("backTo"), "/money?tab=plan");
  const planned = await prisma.plannedTransaction.findFirst({ where: { id, spaceId } });
  if (!planned) redirect(backTo);

  const now = monthKey();

  let accountId = planned!.accountId;
  if (accountId) {
    const owns = await prisma.finAccount.count({ where: { id: accountId, spaceId, archived: false } });
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
          spaceId,
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
  const { userId } = await requireSpace();
  const num = (k: string) => Math.max(0, Math.round(toNum(formData.get(k) ?? 0)));
  const flt = (k: string) => toNum(formData.get(k) ?? 0);
  const values = {
    monthlyIncome: BigInt(num("monthlyIncome")),
    monthlyExpense: BigInt(num("monthlyExpense")),
    salaryGrowthPct: flt("salaryGrowthPct"),
    inflationPct: flt("inflationPct"),
    savingsRatePct: flt("savingsRatePct"),
  };
  await prisma.settings.upsert({
    where: { userId },
    create: { userId, ...values },
    update: values,
  });
  revalidatePath("/future");
  revalidatePath("/");
  redirect("/future?ok=" + encodeURIComponent("Assumptions saved — forecast updated"));
}

export async function clearAssumptions() {
  const { userId } = await requireSpace();
  const values = { monthlyIncome: 0n, monthlyExpense: 0n };
  await prisma.settings.upsert({
    where: { userId },
    create: { userId, ...values },
    update: values,
  });
  revalidatePath("/future");
  revalidatePath("/");
  redirect(
    "/future?ok=" + encodeURIComponent("Cleared — forecast now follows your plan and debts"),
  );
}

/* ---------- investments ---------- */

export async function addHolding(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const kind = String(formData.get("kind") ?? "crypto");
  if (kind === "crypto") {
    const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase().slice(0, 12);
    const quantity = Math.max(0, toNum(formData.get("quantity") ?? 0));
    if (!symbol || !quantity) {
      redirect("/invest?err=" + encodeURIComponent("Enter a coin and an amount"));
    }
    await prisma.holding.create({
      data: { userId, spaceId, kind: "crypto", symbol, name: symbol, quantity },
    });
  } else {
    const name = String(formData.get("name") ?? "").trim().slice(0, 60);
    const value = Math.abs(Math.round(toNum(formData.get("value") ?? 0)));
    if (!name || !value) {
      redirect("/invest?err=" + encodeURIComponent("Enter a name and a value"));
    }
    await prisma.holding.create({
      data: { userId, spaceId, kind: kind.slice(0, 20), name, manualValue: BigInt(value) },
    });
  }
  revalidatePath("/invest");
  revalidatePath("/");
  redirect("/invest?ok=" + encodeURIComponent("Holding added"));
}

export async function updateHolding(formData: FormData) {
  const { spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.holding.findFirst({ where: { id, spaceId } });
  if (!existing) redirect("/invest");
  if (existing!.kind === "crypto") {
    const quantity = Math.max(0, toNum(formData.get("quantity") ?? 0));
    await prisma.holding.update({ where: { id }, data: { quantity } });
  } else {
    const name = String(formData.get("name") ?? "").trim().slice(0, 60) || existing!.name;
    const value = Math.abs(Math.round(toNum(formData.get("value") ?? 0)));
    await prisma.holding.update({ where: { id }, data: { name, manualValue: BigInt(value) } });
  }
  revalidatePath("/invest");
  revalidatePath("/");
  redirect("/invest?ok=" + encodeURIComponent("Holding updated"));
}

export async function deleteHolding(formData: FormData) {
  const { spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  await prisma.holding.deleteMany({ where: { id, spaceId } });
  revalidatePath("/invest");
  revalidatePath("/");
  redirect("/invest?ok=" + encodeURIComponent("Holding removed"));
}

/* ---------- premium ---------- */

export async function createCheckout(formData: FormData) {
  const { userId } = await requireSpace();
  const tier = String(formData.get("tier") ?? "") as Tier;
  if (!PLANS[tier]) redirect("/upgrade?err=" + encodeURIComponent("Pick a plan"));
  if (!midtransConfigured()) {
    redirect("/upgrade?err=" + encodeURIComponent("Payments are not set up on the server yet"));
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");

  const orderId = `saku-${tier}-${randomUUID()}`;
  await prisma.payment.create({
    data: { userId, orderId, tier, amount: PLANS[tier].price, status: "pending" },
  });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  const result = await createSnapTransaction({
    orderId,
    amount: PLANS[tier].price,
    email: user!.email,
    name: user!.name,
    itemName: `SmartSaku Premium — ${PLANS[tier].label}`,
    finishUrl: `${origin}/upgrade?done=1`,
  });
  if (!result) {
    redirect("/upgrade?err=" + encodeURIComponent("Could not start the payment — try again"));
  }
  redirect(result!.redirectUrl);
}
