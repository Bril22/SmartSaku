import { prisma } from "./db";

/** Record a destructive action. Best-effort: a logging failure never blocks
 * the action the user asked for. */
export async function logAudit(
  userId: string,
  spaceId: string | null,
  action: string,
  summary: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { userId, spaceId, action, summary: summary.slice(0, 300) },
    });
  } catch {
    // never let audit logging break the operation
  }
}
