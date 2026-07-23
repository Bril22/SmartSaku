/** Input helpers that never throw, so a malformed form field rejects politely
 * instead of turning a BigInt(NaN) into a 500. */

/** parse a form value to a finite number; anything invalid becomes 0 */
export function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** trim a form value to a string, capped at `max` characters */
export function toStr(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

/** clamp a numeric form value into a range */
export function clampNum(v: unknown, min: number, max: number): number {
  return Math.min(max, Math.max(min, toNum(v)));
}
