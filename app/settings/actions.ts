"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner, requireSpace } from "@/lib/space";
import { createSession, destroySession, revokeSessions } from "@/lib/auth";
import { CURRENCIES } from "@/lib/money";



function back(path: string, msg: string, isError = false) {
  redirect(`${path}?${isError ? "err" : "ok"}=${encodeURIComponent(msg)}`);
}

export async function updateProfileName(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const parsed = z.string().trim().min(1).max(40).safeParse(formData.get("name"));
  if (!parsed.success) back("/settings", "Name cannot be empty", true);
  await prisma.user.update({ where: { id: userId }, data: { name: parsed.data! } });
  revalidatePath("/");
  back("/settings", "Name updated");
}

export async function updateCurrency(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const code = String(formData.get("currency") ?? "IDR");
  if (!CURRENCIES[code]) back("/settings", "Unknown currency", true);
  await prisma.settings.upsert({
    where: { userId },
    create: { userId, currency: code },
    update: { currency: code },
  });
  revalidatePath("/", "layout");
  back("/settings", `Currency set to ${code}`);
}

export async function changePassword(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const schema = z.object({
    current: z.string().min(1),
    next: z.string().min(8),
    confirm: z.string(),
  });
  const parsed = schema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) back("/settings", "New password must be at least 8 characters", true);
  const { current, next, confirm } = parsed.data!;
  if (next !== confirm) back("/settings", "The two new passwords do not match", true);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) back("/settings", "Account not found", true);
  // an account created through Google has no password yet, so there is none to confirm
  if (user!.passwordHash && !(await bcrypt.compare(current, user!.passwordHash))) {
    back("/settings", "Current password is wrong", true);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });
  // end sessions everywhere else, then keep this one signed in
  await revokeSessions(userId);
  await createSession(userId);
  back("/settings", user!.passwordHash ? "Password changed 🔒" : "Password set 🔒");
}

export async function deleteMyAccount(formData: FormData) {
  const { userId } = await requireSpace();
  const email = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.email !== email) {
    back("/settings", "Email does not match — account NOT deleted", true);
  }

  // deleting the user cascades away the shared rows they happened to create,
  // which would quietly damage the space for everyone still in it
  const ownedShared = await prisma.space.findMany({
    where: {
      personal: false,
      members: { some: { userId, role: "OWNER" } },
    },
    include: { _count: { select: { members: true } } },
  });
  const blocking = ownedShared.filter((s) => s._count.members > 1);
  if (blocking.length > 0) {
    back(
      "/settings",
      `First hand over or delete the shared space${blocking.length > 1 ? "s" : ""} you own: ` +
        blocking.map((s) => s.name).join(", "),
      true,
    );
  }

  await prisma.user.delete({ where: { id: userId } });
  await destroySession();
  redirect("/login");
}

/* ---------- accounts ---------- */

export async function renameFinAccount(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const parsed = z.string().trim().min(1).max(40).safeParse(formData.get("name"));
  if (!parsed.success) back("/settings/accounts", "Name cannot be empty", true);
  await prisma.finAccount.updateMany({ where: { id, spaceId }, data: { name: parsed.data! } });
  revalidatePath("/", "layout");
  back("/settings/accounts", "Account renamed");
}

export async function toggleArchiveAccount(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const account = await prisma.finAccount.findFirst({ where: { id, spaceId } });
  if (!account) back("/settings/accounts", "Account not found", true);
  await prisma.finAccount.update({ where: { id }, data: { archived: !account!.archived } });
  revalidatePath("/", "layout");
  back("/settings/accounts", account!.archived ? "Account restored" : "Account archived");
}

export async function deleteFinAccount(formData: FormData) {
  const { userId, spaceId } = await requireOwner("/settings/accounts");
  const id = String(formData.get("id") ?? "");
  const mode = String(formData.get("mode") ?? "move");
  const targetId = String(formData.get("targetAccountId") ?? "");
  const path = "/settings/accounts";

  const account = await prisma.finAccount.findFirst({ where: { id, spaceId } });
  if (!account) back(path, "Account not found", true);
  const txCount = await prisma.transaction.count({ where: { accountId: id, userId } });

  if (txCount === 0) {
    await prisma.finAccount.delete({ where: { id } });
    revalidatePath("/", "layout");
    back(path, `"${account!.name}" deleted`);
  }

  if (mode === "move") {
    const target = await prisma.finAccount.findFirst({
      where: { id: targetId, spaceId, archived: false, NOT: { id } },
    });
    if (!target) back(path, "Choose another account to move the history into", true);
    await prisma.$transaction(
      async (tx) => {
        await tx.transaction.updateMany({
          where: { spaceId, accountId: id },
          data: { accountId: target!.id },
        });
        await tx.plannedTransaction.updateMany({
          where: { spaceId, accountId: id },
          data: { accountId: target!.id },
        });
        await tx.finAccount.update({
          where: { id: target!.id },
          data: { balance: { increment: account!.balance } },
        });
        await tx.finAccount.delete({ where: { id } });
      },
      { timeout: 30_000 },
    );
    revalidatePath("/", "layout");
    back(
      path,
      `"${account!.name}" deleted — ${txCount} transaction${txCount === 1 ? "" : "s"} and its balance moved to ${target!.name}`,
    );
  }

  await prisma.$transaction(
    async (tx) => {
      const txs = await tx.transaction.findMany({ where: { spaceId, accountId: id } });
      const txIds = txs.map((t) => t.id);
      const payments = await tx.debtPayment.findMany({ where: { transactionId: { in: txIds } } });
      for (const p of payments) {
        await tx.debt.updateMany({
          where: { id: p.debtId, status: "PAID_OFF" },
          data: { status: "ACTIVE" },
        });
      }
      await tx.debtPayment.deleteMany({ where: { transactionId: { in: txIds } } });
      await tx.goalContribution.deleteMany({ where: { transactionId: { in: txIds } } });
      await tx.finAccount.delete({ where: { id } });
    },
    { timeout: 30_000 },
  );
  revalidatePath("/", "layout");
  back(
    path,
    `"${account!.name}" and its ${txCount} transaction${txCount === 1 ? "" : "s"} were deleted`,
  );
}

/* ---------- categories ---------- */

const categorySchema = z.object({
  name: z.string().trim().min(1).max(30),
  icon: z.string().trim().min(1).max(8),
  type: z.enum(["INCOME", "EXPENSE"]),
});

export async function addCategory(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") || "🏷️",
    type: formData.get("type"),
  });
  if (!parsed.success) back("/settings/categories", "Please fill the category name", true);
  const { name, icon, type } = parsed.data!;
  const exists = await prisma.category.findFirst({ where: { spaceId, name, type } });
  if (exists) back("/settings/categories", `"${name}" already exists`, true);
  await prisma.category.create({ data: { userId, spaceId, name, icon, type } });
  back("/settings/categories", `Category "${name}" added`);
}

export async function updateCategory(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.category.findFirst({ where: { id, spaceId } });
  if (!existing) back("/settings/categories", "Category not found", true);
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") || existing!.icon,
    type: existing!.type,
  });
  if (!parsed.success) back("/settings/categories", "Name cannot be empty", true);
  const { name, icon } = parsed.data!;
  const budget = Math.abs(Math.round(Number(formData.get("budget") ?? 0)));
  const conflict = await prisma.category.findFirst({
    where: { spaceId, name, type: existing!.type, NOT: { id } },
  });
  if (conflict) back("/settings/categories", `"${name}" already exists`, true);
  await prisma.category.update({ where: { id }, data: { name, icon, budget: BigInt(budget) } });
  revalidatePath("/", "layout");
  back("/settings/categories", "Category updated");
}

export async function deleteCategory(formData: FormData) {
  const { userId, spaceId } = await requireOwner("/settings/categories");
  const id = String(formData.get("id") ?? "");
  await prisma.category.deleteMany({ where: { id, spaceId } });
  revalidatePath("/", "layout");
  back("/settings/categories", "Category deleted — its transactions are kept");
}

const TEMPLATES = "/settings/templates";
const templateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().min(1).max(8),
});

async function validCategory(raw: FormDataEntryValue | null, spaceId: string) {
  const id = String(raw ?? "");
  if (!id) return null;
  const found = await prisma.category.findFirst({ where: { id, spaceId }, select: { id: true } });
  return found ? id : null;
}

async function validAccount(raw: FormDataEntryValue | null, spaceId: string) {
  const id = String(raw ?? "");
  if (!id) return null;
  const found = await prisma.finAccount.findFirst({ where: { id, spaceId }, select: { id: true } });
  return found ? id : null;
}

export async function addTemplate(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    emoji: formData.get("emoji") || "⭐",
  });
  if (!parsed.success) back(TEMPLATES, "Please give the template a name", true);
  const { name, emoji } = parsed.data!;
  const direction = formData.get("direction") === "IN" ? "IN" : "OUT";
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const categoryId = await validCategory(formData.get("categoryId"), spaceId!);
  const accountId = await validAccount(formData.get("accountId"), spaceId!);
  const note = String(formData.get("note") ?? "").slice(0, 120);
  const count = await prisma.transactionTemplate.count({ where: { spaceId } });
  await prisma.transactionTemplate.create({
    data: { userId, spaceId, name, emoji, direction, amount: BigInt(amount), categoryId, accountId, note, sortOrder: count },
  });
  revalidatePath("/add");
  back(TEMPLATES, `Template "${name}" saved`);
}

export async function updateTemplate(formData: FormData) {
  const { spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.transactionTemplate.findFirst({ where: { id, spaceId } });
  if (!existing) back(TEMPLATES, "Template not found", true);
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    emoji: formData.get("emoji") || existing!.emoji,
  });
  if (!parsed.success) back(TEMPLATES, "Name cannot be empty", true);
  const { name, emoji } = parsed.data!;
  const direction = formData.get("direction") === "IN" ? "IN" : "OUT";
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const categoryId = await validCategory(formData.get("categoryId"), spaceId!);
  const accountId = await validAccount(formData.get("accountId"), spaceId!);
  const note = String(formData.get("note") ?? "").slice(0, 120);
  await prisma.transactionTemplate.update({
    where: { id },
    data: { name, emoji, direction, amount: BigInt(amount), categoryId, accountId, note },
  });
  revalidatePath("/add");
  back(TEMPLATES, "Template updated");
}

export async function deleteTemplate(formData: FormData) {
  const { spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  await prisma.transactionTemplate.deleteMany({ where: { id, spaceId } });
  revalidatePath("/add");
  back(TEMPLATES, "Template removed");
}
