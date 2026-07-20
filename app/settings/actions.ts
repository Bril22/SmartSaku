"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { destroySession, getSessionUserId } from "@/lib/auth";
import { CURRENCIES } from "@/lib/money";

async function requireUser(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  return userId;
}

function back(path: string, msg: string, isError = false) {
  redirect(`${path}?${isError ? "err" : "ok"}=${encodeURIComponent(msg)}`);
}

export async function updateProfileName(formData: FormData) {
  const userId = await requireUser();
  const parsed = z.string().trim().min(1).max(40).safeParse(formData.get("name"));
  if (!parsed.success) back("/settings", "Name cannot be empty", true);
  await prisma.user.update({ where: { id: userId }, data: { name: parsed.data! } });
  revalidatePath("/");
  back("/settings", "Name updated");
}

export async function updateCurrency(formData: FormData) {
  const userId = await requireUser();
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
  const userId = await requireUser();
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
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    back("/settings", "Current password is wrong", true);
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });
  back("/settings", "Password changed 🔒");
}

export async function deleteMyAccount(formData: FormData) {
  const userId = await requireUser();
  const email = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.email !== email) {
    back("/settings", "Email does not match — account NOT deleted", true);
  }
  await prisma.user.delete({ where: { id: userId } });
  await destroySession();
  redirect("/login");
}

/* ---------- accounts ---------- */

export async function renameFinAccount(formData: FormData) {
  const userId = await requireUser();
  const id = String(formData.get("id") ?? "");
  const parsed = z.string().trim().min(1).max(40).safeParse(formData.get("name"));
  if (!parsed.success) back("/settings/accounts", "Name cannot be empty", true);
  await prisma.finAccount.updateMany({ where: { id, userId }, data: { name: parsed.data! } });
  revalidatePath("/", "layout");
  back("/settings/accounts", "Account renamed");
}

export async function toggleArchiveAccount(formData: FormData) {
  const userId = await requireUser();
  const id = String(formData.get("id") ?? "");
  const account = await prisma.finAccount.findFirst({ where: { id, userId } });
  if (!account) back("/settings/accounts", "Account not found", true);
  await prisma.finAccount.update({ where: { id }, data: { archived: !account!.archived } });
  revalidatePath("/", "layout");
  back("/settings/accounts", account!.archived ? "Account restored" : "Account archived");
}

export async function deleteFinAccount(formData: FormData) {
  const userId = await requireUser();
  const id = String(formData.get("id") ?? "");
  const txCount = await prisma.transaction.count({ where: { accountId: id, userId } });
  if (txCount > 0) {
    back("/settings/accounts", "This account has transactions — archive it instead", true);
  }
  await prisma.finAccount.deleteMany({ where: { id, userId } });
  revalidatePath("/", "layout");
  back("/settings/accounts", "Account deleted");
}

/* ---------- categories ---------- */

const categorySchema = z.object({
  name: z.string().trim().min(1).max(30),
  icon: z.string().trim().min(1).max(8),
  type: z.enum(["INCOME", "EXPENSE"]),
});

export async function addCategory(formData: FormData) {
  const userId = await requireUser();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") || "🏷️",
    type: formData.get("type"),
  });
  if (!parsed.success) back("/settings/categories", "Please fill the category name", true);
  const { name, icon, type } = parsed.data!;
  const exists = await prisma.category.findFirst({ where: { userId, name, type } });
  if (exists) back("/settings/categories", `"${name}" already exists`, true);
  await prisma.category.create({ data: { userId, name, icon, type } });
  back("/settings/categories", `Category "${name}" added`);
}

export async function updateCategory(formData: FormData) {
  const userId = await requireUser();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.category.findFirst({ where: { id, userId } });
  if (!existing) back("/settings/categories", "Category not found", true);
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") || existing!.icon,
    type: existing!.type,
  });
  if (!parsed.success) back("/settings/categories", "Name cannot be empty", true);
  const { name, icon } = parsed.data!;
  const conflict = await prisma.category.findFirst({
    where: { userId, name, type: existing!.type, NOT: { id } },
  });
  if (conflict) back("/settings/categories", `"${name}" already exists`, true);
  await prisma.category.update({ where: { id }, data: { name, icon } });
  revalidatePath("/", "layout");
  back("/settings/categories", "Category updated");
}

export async function deleteCategory(formData: FormData) {
  const userId = await requireUser();
  const id = String(formData.get("id") ?? "");
  await prisma.category.deleteMany({ where: { id, userId } });
  revalidatePath("/", "layout");
  back("/settings/categories", "Category deleted — its transactions are kept");
}
