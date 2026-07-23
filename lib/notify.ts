import { prisma } from "./db";
import { notifyUser } from "./push";
import { getDebtSummaries } from "./finance";

function localHour(tz: string, now: Date): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(now);
    return Number(s) % 24;
  } catch {
    return now.getUTCHours();
  }
}

/** "YYYY-MM-DD" in the given timezone */
function localDate(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** claim a send atomically; returns false if it was already sent */
async function claim(userId: string, kind: string): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { userId, kind } });
    return true;
  } catch {
    return false;
  }
}

async function dueSummary(userId: string, localDay: number, monthStart: Date): Promise<string[]> {
  const memberships = await prisma.spaceMember.findMany({
    where: { userId },
    select: { spaceId: true },
  });
  const spaceIds = memberships.map((m) => m.spaceId);
  if (!spaceIds.length) return [];

  const items: string[] = [];

  // bills due on this day of the month that have not been recorded yet
  const bills = await prisma.plannedTransaction.findMany({
    where: { spaceId: { in: spaceIds }, active: true, direction: "OUT", dayOfMonth: localDay },
  });
  for (const b of bills) {
    const recorded = await prisma.transaction.count({
      where: { plannedId: b.id, plannedMonth: monthStart },
    });
    if (recorded === 0) items.push(b.name);
  }

  // debt installments: a heads-up on the 1st, a firmer nudge from the 25th on
  if (localDay === 1 || localDay >= 25) {
    for (const spaceId of spaceIds) {
      const debts = await getDebtSummaries(spaceId);
      for (const d of debts) {
        if (d.thisMonthStatus === "DUE" || d.thisMonthStatus === "PARTIAL") {
          items.push(`${d.lender} installment`);
        }
      }
    }
  }
  return items;
}

/** Send the daily log nudge and due reminders to everyone whose local time
 * matches their chosen hour. Idempotent per user per day. */
export async function runReminders(now: Date): Promise<number> {
  const people = await prisma.settings.findMany({
    where: { OR: [{ notifyDaily: true }, { notifyDebts: true }] },
    select: {
      userId: true,
      notifyDaily: true,
      notifyDebts: true,
      notifyHour: true,
      notifyTz: true,
    },
  });

  let sent = 0;
  for (const p of people) {
    if (localHour(p.notifyTz, now) !== p.notifyHour) continue;

    const [webDevices, nativeDevices] = await Promise.all([
      prisma.pushSubscription.count({ where: { userId: p.userId } }),
      prisma.nativePushToken.count({ where: { userId: p.userId } }),
    ]);
    if (!webDevices && !nativeDevices) continue;

    const day = localDate(p.notifyTz, now); // YYYY-MM-DD
    const dayNum = Number(day.slice(8, 10));
    const monthStart = new Date(day.slice(0, 8) + "01T00:00:00Z");

    if (p.notifyDaily && (await claim(p.userId, `daily:${day}`))) {
      sent += await notifyUser(p.userId, {
        title: "Log today's spending 🌱",
        body: "A quick minute now keeps your budget honest. Tap to add.",
        url: "/add",
        tag: "daily",
      });
    }

    if (p.notifyDebts && (await claim(p.userId, `due:${day}`))) {
      const items = await dueSummary(p.userId, dayNum, monthStart);
      if (items.length) {
        const more = items.length - 1;
        sent += await notifyUser(p.userId, {
          title: "Payment reminder 🔔",
          body: more > 0 ? `${items[0]} and ${more} more due. Tap to review.` : `${items[0]} is due. Tap to review.`,
          url: "/",
          tag: "due",
        });
      }
    }
  }
  return sent;
}
