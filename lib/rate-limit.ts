import { prisma } from "./db";

/**
 * Fixed-window limiter backed by Postgres.
 *
 * In-memory counters do not work here: every serverless instance would keep
 * its own, so the real limit becomes (limit x instances). One row per key is
 * slower but actually holds.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  try {
    // one statement, so two concurrent requests cannot both read a stale count
    const rows = await prisma.$queryRaw<{ count: number; window_start: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "windowStart")
      VALUES (${key}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowStart" < ${windowStart} THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "windowStart" = CASE
          WHEN "RateLimit"."windowStart" < ${windowStart} THEN ${now}
          ELSE "RateLimit"."windowStart"
        END
      RETURNING "count", "windowStart" AS window_start
    `;
    const row = rows[0];
    if (!row) return { ok: true, retryAfter: 0 };
    if (row.count <= limit) return { ok: true, retryAfter: 0 };
    const elapsed = (now.getTime() - new Date(row.window_start).getTime()) / 1000;
    return { ok: false, retryAfter: Math.max(1, Math.ceil(windowSeconds - elapsed)) };
  } catch {
    // never lock people out of their own money because the limiter itself broke
    return { ok: true, retryAfter: 0 };
  }
}

/** Rough client identity for pre-login limits. */
export async function clientKey(prefix: string): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `${prefix}:${ip}`;
}
