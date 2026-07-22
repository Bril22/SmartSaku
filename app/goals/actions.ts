"use server";

import OpenAI from "openai";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { requireOwner, requireSpace } from "@/lib/space";
import { getSessionUserId } from "@/lib/auth";
import { getDebtSummaries } from "@/lib/finance";
import { MINOR, monthLabel } from "@/lib/format";

/** the model reasons in rupiah, storage is minor units */
function rupiah(minor: number): string {
  return (minor / MINOR).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

const BACK = "/future";



function back(msg: string, isError = false) {
  redirect(`${BACK}?${isError ? "err" : "ok"}=${encodeURIComponent(msg)}`);
}

export async function addGoal(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const name = String(formData.get("name") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim() || "🎯";
  const targetAmount = Math.abs(Math.round(Number(formData.get("targetAmount") ?? 0)));
  const dateRaw = String(formData.get("targetDate") ?? "");
  if (!name || !targetAmount) back("Please fill the goal name and target amount", true);
  const targetDate = dateRaw ? new Date(dateRaw + "T00:00:00Z") : null;
  await prisma.goal.create({
    data: { userId, spaceId, name, icon: icon.slice(0, 8), targetAmount: BigInt(targetAmount), targetDate },
  });
  revalidatePath(BACK);
  back(`Goal "${name}" created 🎯`);
}

export async function updateGoal(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim() || "🎯";
  const targetAmount = Math.abs(Math.round(Number(formData.get("targetAmount") ?? 0)));
  const dateRaw = String(formData.get("targetDate") ?? "");
  const goal = await prisma.goal.findFirst({ where: { id, spaceId } });
  if (!goal || !name || !targetAmount) back("Could not update the goal", true);
  await prisma.goal.update({
    where: { id },
    data: {
      name,
      icon: icon.slice(0, 8),
      targetAmount: BigInt(targetAmount),
      targetDate: dateRaw ? new Date(dateRaw + "T00:00:00Z") : null,
    },
  });
  revalidatePath(BACK);
  back("Goal updated");
}

export async function deleteGoal(formData: FormData) {
  const { userId, spaceId } = await requireOwner("/future");
  const id = String(formData.get("id") ?? "");
  const goal = await prisma.goal.findFirst({
    where: { id, spaceId },
    include: { contributions: true },
  });
  if (!goal) back("Goal not found", true);
  await prisma.$transaction(
    async (tx) => {
      for (const c of goal!.contributions) {
        if (!c.transactionId) continue;
        const linked = await tx.transaction.findUnique({ where: { id: c.transactionId } });
        if (linked) {
          await tx.finAccount.update({
            where: { id: linked.accountId },
            data: { balance: { increment: linked.amount } },
          });
          await tx.transaction.delete({ where: { id: linked.id } });
        }
      }
      await tx.goal.delete({ where: { id } });
    },
    { timeout: 30_000 },
  );
  revalidatePath("/", "layout");
  back(`Goal "${goal!.name}" deleted — saved money returned to your accounts`);
}

export async function contributeGoal(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const amount = Math.abs(Math.round(Number(formData.get("amount") ?? 0)));
  const accountId = String(formData.get("accountId") ?? "");
  const goal = await prisma.goal.findFirst({ where: { id, spaceId } });
  const account = await prisma.finAccount.findFirst({
    where: { id: accountId, spaceId, archived: false },
  });
  if (!goal || !amount) back("Please fill the amount", true);
  if (!account) back("Choose which account the money comes from", true);

  const category = await prisma.category.upsert({
    where: { spaceId_name_type: { spaceId, name: "Goals", type: "EXPENSE" } },
    create: { userId, spaceId, name: "Goals", type: "EXPENSE", icon: "🎯" },
    update: {},
  });
  const saved = await prisma.goalContribution.aggregate({
    where: { goalId: id },
    _sum: { amount: true },
  });
  const reached =
    Number(saved._sum.amount ?? 0n) + amount >= Number(goal!.targetAmount);

  await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        accountId: account!.id,
        categoryId: category.id,
        amount: BigInt(amount),
        direction: "OUT",
        note: `Saving for ${goal!.name}`,
      },
    });
    await tx.finAccount.update({
      where: { id: account!.id },
      data: { balance: { decrement: BigInt(amount) } },
    });
    await tx.goalContribution.create({
      data: { goalId: id, amount: BigInt(amount), transactionId: created.id },
    });
  });
  revalidatePath("/", "layout");
  if (reached) {
    redirect(
      `${BACK}?ok=` + encodeURIComponent(`"${goal!.name}" target reached — amazing! 🎉`) + "&fx=lunas",
    );
  }
  back(`Saved toward "${goal!.name}" 🎯`);
}

export async function deleteGoalContribution(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const contribution = await prisma.goalContribution.findFirst({
    where: { id, goal: { spaceId } },
  });
  if (!contribution) back("Contribution not found", true);
  await prisma.$transaction(async (tx) => {
    if (contribution!.transactionId) {
      const linked = await tx.transaction.findUnique({
        where: { id: contribution!.transactionId },
      });
      if (linked) {
        await tx.finAccount.update({
          where: { id: linked.accountId },
          data: { balance: { increment: linked.amount } },
        });
        await tx.transaction.delete({ where: { id: linked.id } });
      }
    }
    await tx.goalContribution.delete({ where: { id } });
  });
  revalidatePath("/", "layout");
  back("Contribution undone — money returned to the account");
}

const SAKU_SYSTEM =
  "You are Saku-Kun, a warm and practical personal finance guide for an Indonesian user (amounts in IDR). " +
  "Answer in under 130 words, be concrete with numbers and months, plain English and friendly. " +
  "No financial-advice disclaimers — the app already shows one.";

async function goalContext(userId: string, spaceId: string, id: string) {
  const goal = await prisma.goal.findFirst({
    where: { id, spaceId },
    include: { contributions: true },
  });
  if (!goal) return null;

  const [debts, accounts, planned, settings] = await Promise.all([
    getDebtSummaries(spaceId),
    prisma.finAccount.findMany({ where: { spaceId, archived: false, hidden: false } }),
    prisma.plannedTransaction.findMany({ where: { spaceId, active: true } }),
    prisma.settings.findUnique({ where: { userId } }),
  ]);
  const savings = accounts.reduce((a, x) => a + Number(x.balance), 0);
  const saved = goal!.contributions.reduce((a, c) => a + Number(c.amount), 0);
  const plannedIn = planned.filter((p) => p.direction === "IN").reduce((a, p) => a + Number(p.amount), 0);
  const plannedOut = planned.filter((p) => p.direction === "OUT").reduce((a, p) => a + Number(p.amount), 0);
  const income = plannedIn || Number(settings?.monthlyIncome ?? 0n);
  const debtLines = debts
    .filter((d) => d.remaining > 0)
    .map(
      (d) =>
        `${d.lender}: remaining Rp${rupiah(d.remaining)}, ~Rp${rupiah(d.thisMonthPlanned)}/month, finishes ${d.finishMonth ? monthLabel(d.finishMonth) : "?"}`,
    )
    .join("\n");

  const summary = [
    `Monthly income: Rp${rupiah(income)}`,
    `Planned monthly expenses (excl. debt): Rp${rupiah(plannedOut)}`,
    `Current savings across accounts: Rp${rupiah(savings)}`,
    `Debts:\n${debtLines || "none"}`,
    `GOAL: "${goal!.name}" — target Rp${rupiah(Number(goal!.targetAmount))}` +
      (goal!.targetDate ? `, wanted by ${monthLabel(goal!.targetDate)}` : ", no target date") +
      `, already saved Rp${rupiah(saved)}`,
  ].join("\n");
  return { goal: goal!, summary };
}

export async function askGoalAdvice(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const aiLimit = await rateLimit(`ai:askGoalAdvice:${userId}`, 10, 3600);
  if (!aiLimit.ok) {
    redirect("/future?err=" + encodeURIComponent("Too many AI requests — try again shortly"));
  }
  const id = String(formData.get("id") ?? "");
  const ctx = await goalContext(userId, spaceId, id);
  if (!ctx) back("Goal not found", true);
  const { summary } = ctx!;

  let advice = "";
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            SAKU_SYSTEM +
            " Given their finances and a savings goal, cover: 1) is the goal realistic (and by when), " +
            "2) a suggested monthly saving amount, 3) the smartest timing considering their debt schedule.",
        },
        { role: "user", content: summary },
      ],
    });
    advice = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 429) back("OpenAI has no API credit — top up and try again", true);
    back("Saku AI could not answer right now — try again", true);
  }
  if (!advice) back("Saku AI could not answer right now — try again", true);

  await prisma.goalMessage.create({ data: { goalId: id, role: "AI", text: advice } });
  revalidatePath(BACK);
  back("Saku-Kun has advice for you 🌱");
}

export async function replyToSaku(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const aiLimit = await rateLimit(`ai:replyToSaku:${userId}`, 20, 3600);
  if (!aiLimit.ok) {
    redirect("/future?err=" + encodeURIComponent("Too many AI requests — try again shortly"));
  }
  const id = String(formData.get("id") ?? "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 500);
  if (!text) back("Write a question first", true);

  const ctx = await goalContext(userId, spaceId, id);
  if (!ctx) back("Goal not found", true);

  const history = await prisma.goalMessage.findMany({
    where: { goalId: id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  await prisma.goalMessage.create({ data: { goalId: id, role: "USER", text } });

  let reply = "";
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        { role: "system", content: SAKU_SYSTEM },
        { role: "user", content: `Here are my current numbers:\n${ctx!.summary}` },
        ...history.map((m) => ({
          role: (m.role === "AI" ? "assistant" : "user") as "assistant" | "user",
          content: m.text,
        })),
        { role: "user", content: text },
      ],
    });
    reply = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 429) back("OpenAI has no API credit — top up and try again", true);
    back("Saku AI could not answer right now — try again", true);
  }
  if (!reply) back("Saku AI could not answer right now — try again", true);

  await prisma.goalMessage.create({ data: { goalId: id, role: "AI", text: reply } });
  revalidatePath(BACK);
  back("Saku-Kun replied 🌱");
}

export async function clearGoalChat(formData: FormData) {
  const { spaceId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const goal = await prisma.goal.findFirst({ where: { id, spaceId } });
  if (!goal) back("Goal not found", true);
  await prisma.goalMessage.deleteMany({ where: { goalId: id } });
  revalidatePath(BACK);
  back("Chat cleared");
}
