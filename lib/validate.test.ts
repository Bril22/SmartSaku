import { describe, expect, it } from "vitest";
import { clampNum, toNum, toStr } from "./validate";

describe("input validators", () => {
  it("toNum returns 0 for anything non-finite", () => {
    expect(toNum("12345")).toBe(12345);
    expect(toNum("")).toBe(0);
    expect(toNum("abc")).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum(NaN)).toBe(0);
    expect(toNum(Infinity)).toBe(0);
  });

  it("toNum keeps a bad amount from crashing a BigInt conversion", () => {
    // this is the exact shape used in the actions
    const amount = Math.abs(Math.round(toNum("not a number")));
    expect(() => BigInt(amount)).not.toThrow();
    expect(BigInt(amount)).toBe(0n);
  });

  it("toStr trims and caps length", () => {
    expect(toStr("  hi  ")).toBe("hi");
    expect(toStr("x".repeat(500), 10)).toHaveLength(10);
    expect(toStr(null)).toBe("");
  });

  it("clampNum keeps a value in range", () => {
    expect(clampNum("50", 0, 100)).toBe(50);
    expect(clampNum("-5", 0, 100)).toBe(0);
    expect(clampNum("999", 0, 100)).toBe(100);
    expect(clampNum("junk", 0, 100)).toBe(0);
  });
});
