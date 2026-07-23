import { redirect } from "next/navigation";
import { prisma } from "./db";
import { readSession } from "./auth";

export type Tier = "month" | "year" | "lifetime";

export const PLANS: Record<Tier, { tier: Tier; label: string; price: number; months: number | null; blurb: string }> = {
  month: { tier: "month", label: "Monthly", price: 29000, months: 1, blurb: "Renew each month" },
  year: { tier: "year", label: "Yearly", price: 149000, months: 12, blurb: "Best value — save ~57%" },
  lifetime: { tier: "lifetime", label: "Lifetime", price: 399000, months: null, blurb: "Pay once, keep forever" },
};

/** Everything gated behind Premium, for showing on the upgrade page. */
export const PREMIUM_FEATURES = [
  "Saku AI — scan receipts, PDFs and statements",
  "AI money consultant chat",
  "Investments & net worth (live crypto prices)",
  "Debt payoff planner (snowball vs avalanche)",
];

export function isPremiumUser(u: { premiumUntil: Date | null; lifetime: boolean }): boolean {
  if (u.lifetime) return true;
  return !!u.premiumUntil && u.premiumUntil.getTime() > Date.now();
}

export async function getPremium(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { premiumUntil: true, lifetime: true },
  });
  return u ? isPremiumUser(u) : false;
}

/** Guard a premium-only page: sends free users to the upgrade screen. */
export async function requirePremium(from: string): Promise<void> {
  const session = await readSession();
  if (!session) redirect("/login");
  if (!(await getPremium(session.userId))) {
    redirect("/upgrade?from=" + encodeURIComponent(from));
  }
}

/** Extend a user's premium after a successful payment. */
export async function grantPremium(userId: string, tier: Tier): Promise<void> {
  if (tier === "lifetime") {
    await prisma.user.update({ where: { id: userId }, data: { lifetime: true } });
    return;
  }
  const months = PLANS[tier].months ?? 1;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premiumUntil: true },
  });
  const base =
    user?.premiumUntil && user.premiumUntil.getTime() > Date.now()
      ? new Date(user.premiumUntil)
      : new Date();
  base.setMonth(base.getMonth() + months);
  await prisma.user.update({ where: { id: userId }, data: { premiumUntil: base } });
}
