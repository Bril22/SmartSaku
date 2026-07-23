import { describe, expect, it } from "vitest";
import { comparePayoff, monthlyBudget, simulatePayoff, type PayoffDebt } from "./payoff";

// balances in minor units (×100)
const rp = (major: number) => major * 100;

describe("payoff simulator", () => {
  it("clears a single interest-free debt in balance / payment months", () => {
    const debts: PayoffDebt[] = [
      { id: "a", lender: "A", balance: rp(1_000_000), aprPct: 0, minPayment: rp(100_000) },
    ];
    const r = simulatePayoff(debts, 0, "avalanche");
    expect(r.months).toBe(10);
    expect(r.totalInterest).toBe(0);
    expect(r.order).toEqual(["a"]);
    expect(r.neverPaysOff).toBe(false);
  });

  it("charges interest on a carried balance", () => {
    const debts: PayoffDebt[] = [
      { id: "a", lender: "A", balance: rp(1_000_000), aprPct: 24, minPayment: rp(100_000) },
    ];
    const r = simulatePayoff(debts, 0, "avalanche");
    // 2% monthly interest means it takes longer and costs interest
    expect(r.months).toBeGreaterThan(10);
    expect(r.totalInterest).toBeGreaterThan(0);
  });

  it("extra payment clears debt sooner and cuts interest", () => {
    const debts: PayoffDebt[] = [
      { id: "a", lender: "A", balance: rp(5_000_000), aprPct: 18, minPayment: rp(250_000) },
    ];
    const base = simulatePayoff(debts, 0, "avalanche");
    const withExtra = simulatePayoff(debts, rp(250_000), "avalanche");
    expect(withExtra.months).toBeLessThan(base.months);
    expect(withExtra.totalInterest).toBeLessThan(base.totalInterest);
  });

  it("avalanche targets the highest rate, snowball the smallest balance", () => {
    const debts: PayoffDebt[] = [
      { id: "big-lowrate", lender: "Big", balance: rp(10_000_000), aprPct: 5, minPayment: rp(200_000) },
      { id: "small-highrate", lender: "Small", balance: rp(2_000_000), aprPct: 40, minPayment: rp(100_000) },
    ];
    const avalanche = simulatePayoff(debts, rp(500_000), "avalanche");
    const snowball = simulatePayoff(debts, rp(500_000), "snowball");
    // avalanche kills the 40% debt first; snowball kills the smaller balance
    // first — here they happen to be the same debt, so check interest instead
    expect(avalanche.totalInterest).toBeLessThanOrEqual(snowball.totalInterest);
    expect(avalanche.order[0]).toBe("small-highrate");
  });

  it("snowball clears the smallest balance first; avalanche costs less interest", () => {
    const debts: PayoffDebt[] = [
      { id: "small-lowrate", lender: "Small", balance: rp(1_000_000), aprPct: 5, minPayment: rp(50_000) },
      { id: "big-highrate", lender: "Big", balance: rp(8_000_000), aprPct: 36, minPayment: rp(200_000) },
    ];
    const snowball = simulatePayoff(debts, rp(400_000), "snowball");
    const avalanche = simulatePayoff(debts, rp(400_000), "avalanche");
    // snowball throws the extra at the smallest balance, so it clears first
    expect(snowball.order[0]).toBe("small-lowrate");
    // avalanche throws the extra at the 36% debt, so it pays less interest overall
    expect(avalanche.totalInterest).toBeLessThan(snowball.totalInterest);
  });

  it("flags a debt that never pays off (payment below interest)", () => {
    const debts: PayoffDebt[] = [
      { id: "a", lender: "A", balance: rp(1_000_000), aprPct: 120, minPayment: rp(1_000) },
    ];
    const r = simulatePayoff(debts, 0, "avalanche");
    expect(r.neverPaysOff).toBe(true);
  });

  it("monthlyBudget sums minimums plus extra", () => {
    const debts: PayoffDebt[] = [
      { id: "a", lender: "A", balance: rp(100), aprPct: 0, minPayment: rp(100_000) },
      { id: "b", lender: "B", balance: rp(100), aprPct: 0, minPayment: rp(50_000) },
    ];
    expect(monthlyBudget(debts, rp(200_000))).toBe(rp(350_000));
  });

  it("comparePayoff reports the gain from an extra payment", () => {
    const debts: PayoffDebt[] = [
      { id: "a", lender: "A", balance: rp(3_000_000), aprPct: 24, minPayment: rp(150_000) },
      { id: "b", lender: "B", balance: rp(1_500_000), aprPct: 36, minPayment: rp(100_000) },
    ];
    const c = comparePayoff(debts, rp(300_000));
    expect(c.totalBalance).toBe(rp(4_500_000));
    expect(c.minMonthly).toBe(rp(250_000));
    expect(c.monthsSaved).toBeGreaterThan(0);
    expect(c.interestSaved).toBeGreaterThan(0);
  });
});
