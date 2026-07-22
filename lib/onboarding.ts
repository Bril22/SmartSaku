import { prisma } from "./db";
import { ensurePersonalSpace } from "./space";

const STARTER_CATEGORIES = [
  { name: "Salary", type: "INCOME", icon: "💰" },
  { name: "Food", type: "EXPENSE", icon: "🍜" },
  { name: "Rent", type: "EXPENSE", icon: "🏠" },
  { name: "Family", type: "EXPENSE", icon: "👨‍👩‍👧" },
  { name: "Transport", type: "EXPENSE", icon: "🚌" },
  { name: "Other", type: "EXPENSE", icon: "🧾" },
] as const;

/** Everything a brand new account needs, however they signed up. */
export async function setUpNewUser(userId: string) {
  const spaceId = await ensurePersonalSpace(userId);
  await prisma.settings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const accounts = await prisma.finAccount.count({ where: { spaceId } });
  if (accounts === 0) {
    await prisma.finAccount.create({
      data: { userId, spaceId, name: "Cash", type: "CASH", balance: 0n, primary: true },
    });
  }
  const categories = await prisma.category.count({ where: { spaceId } });
  if (categories === 0) {
    await prisma.category.createMany({
      data: STARTER_CATEGORIES.map((c) => ({ userId, spaceId, ...c })),
    });
  }
  return spaceId;
}

export function nameFromEmail(email: string): string {
  return email.split("@")[0].replace(/^./, (c) => c.toUpperCase());
}
