import { describe, expect, it } from "vitest";
import {
  MINOR,
  formatMinor,
  minorToTyped,
  normaliseTyped,
  parseMinor,
  shortMinor,
  typedDisplay,
  typedToMinor,
} from "./format";

/**
 * Money is stored as minor units (1/100). If this scale ever drifts, every
 * balance in the database is silently wrong by a factor of 100, so these
 * conversions are pinned here.
 */

const typed = (text: string, allowNegative = false) =>
  typedToMinor(normaliseTyped(text, allowNegative));

describe("scale", () => {
  it("is hundredths", () => {
    expect(MINOR).toBe(100);
  });
});

describe("typing an amount", () => {
  it.each([
    ["1234567,89", "123456789"],
    ["1234567", "123456700"],
    ["85000,5", "8500050"],
    ["0,07", "7"],
    ["0", "0"],
  ])("%s -> %s minor units", (input, expected) => {
    expect(typed(input)).toBe(expected);
  });

  it("truncates beyond two decimals rather than rounding up", () => {
    expect(typed("10,999")).toBe("1099");
  });

  it("ignores separators the user types", () => {
    expect(typed("1.234.567,89")).toBe("123456789");
  });

  it("keeps a minus only when negatives are allowed", () => {
    expect(typed("-500000", true)).toBe("-50000000");
    expect(typed("-500000", false)).toBe("50000000");
  });

  it("returns empty for an empty or lone-minus field", () => {
    expect(typed("")).toBe("");
    expect(typed("-", true)).toBe("");
  });

  it("strips leading zeros", () => {
    expect(normaliseTyped("00123", false)).toBe("123");
  });
});

describe("display while typing", () => {
  it.each([
    ["1234567,89", "1.234.567,89"],
    ["1234567", "1.234.567"],
    ["1234567,", "1.234.567,"],
    ["", ""],
  ])("%s shows as %s", (raw, expected) => {
    expect(typedDisplay(normaliseTyped(raw, false))).toBe(expected);
  });
});

describe("round trip through the editor", () => {
  it.each([123456789, 8500050, 7, 0, -50000000])("%i survives", (minor) => {
    const back = typedToMinor(minorToTyped(minor));
    expect(back === "" ? 0 : Number(back)).toBe(minor);
  });

  it("omits ,00 so the user does not have to delete it", () => {
    expect(minorToTyped(675000000)).toBe("6750000");
    expect(minorToTyped(670000025)).toBe("6700000,25");
  });
});

describe("formatting for display", () => {
  it("always shows two decimals, Indonesian style", () => {
    expect(formatMinor(123456789)).toBe("1.234.567,89");
    expect(formatMinor(0)).toBe("0,00");
    expect(formatMinor(-8500050)).toBe("-85.000,50");
  });

  it("parses its own output", () => {
    expect(parseMinor(formatMinor(123456789))).toBe(123456789);
  });

  it("reads a plain number as whole rupiah", () => {
    expect(parseMinor("1234567")).toBe(123456700);
  });

  it("shortens large amounts", () => {
    expect(shortMinor(123456789)).toBe("Rp1,2jt");
    expect(shortMinor(100000000000)).toBe("Rp1,00M");
    expect(shortMinor(5000000)).toBe("Rp50rb");
  });
});
