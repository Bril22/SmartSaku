import { prisma } from "./db";

/** "2026-07-22T14:30" from the picker, read as the viewer's wall clock */
export function parseWhen(raw: unknown): Date | undefined {
  const v = String(raw ?? "").trim();
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/);
  if (!m) return undefined;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    m[4] ? Number(m[4]) : 0,
    m[5] ? Number(m[5]) : 0,
  );
}

export type TxInput = {
  amount: number; // minor units
  direction: "IN" | "OUT";
  accountId: string;
  categoryId?: string | null;
  note?: string;
  date?: Date;
  clientId?: string;
};

export type TxResult = { ok: boolean; duplicate?: boolean };

/** Create a transaction and move the account balance in one DB transaction.
 * Shared by the online server action and the offline sync route. When a
 * clientId is given the write is idempotent, so re-syncing never duplicates. */
export async function recordTransaction(
  userId: string,
  spaceId: string,
  input: TxInput,
): Promise<TxResult> {
  const amount = Math.abs(Math.round(input.amount));
  if (!amount || !input.accountId) return { ok: false };

  const account = await prisma.finAccount.findFirst({
    where: { id: input.accountId, spaceId },
    select: { id: true },
  });
  if (!account) return { ok: false };

  if (input.clientId) {
    const existing = await prisma.transaction.findUnique({
      where: { clientId: input.clientId },
      select: { id: true },
    });
    if (existing) return { ok: true, duplicate: true };
  }

  const categoryId =
    input.categoryId &&
    (await prisma.category.findFirst({
      where: { id: input.categoryId, spaceId },
      select: { id: true },
    }))
      ? input.categoryId
      : null;

  try {
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          spaceId,
          accountId: input.accountId,
          categoryId,
          amount: BigInt(amount),
          direction: input.direction,
          note: input.note ?? "",
          ...(input.date ? { date: input.date } : {}),
          ...(input.clientId ? { clientId: input.clientId } : {}),
        },
      }),
      prisma.finAccount.update({
        where: { id: input.accountId },
        data: {
          balance: { [input.direction === "IN" ? "increment" : "decrement"]: BigInt(amount) },
        },
      }),
    ]);
  } catch (err) {
    // a concurrent sync of the same clientId lost the race — that is fine
    if (input.clientId) {
      const existing = await prisma.transaction.findUnique({
        where: { clientId: input.clientId },
        select: { id: true },
      });
      if (existing) return { ok: true, duplicate: true };
    }
    throw err;
  }
  return { ok: true };
}
