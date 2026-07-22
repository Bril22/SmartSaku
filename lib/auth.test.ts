import { describe, expect, it } from "vitest";
import { safeBackTo } from "./auth";

/**
 * `backTo` comes from a hidden form field, so it is attacker-controlled.
 * An unchecked value turns every redirect into an open redirect, which is a
 * ready-made phishing hop off a trusted domain.
 */
describe("safeBackTo", () => {
  it("keeps ordinary in-app paths", () => {
    expect(safeBackTo("/money?tab=plan", "/")).toBe("/money?tab=plan");
    expect(safeBackTo("/settings/accounts", "/")).toBe("/settings/accounts");
  });

  it("rejects absolute URLs to another host", () => {
    expect(safeBackTo("https://evil.example/steal", "/")).toBe("/");
    expect(safeBackTo("http://evil.example", "/")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeBackTo("//evil.example/steal", "/")).toBe("/");
  });

  it("rejects backslash tricks some parsers treat as a slash", () => {
    expect(safeBackTo("/\\evil.example", "/")).toBe("/");
    expect(safeBackTo("\\\\evil.example", "/")).toBe("/");
  });

  it("rejects anything that is not an absolute path", () => {
    expect(safeBackTo("money", "/")).toBe("/");
    expect(safeBackTo("javascript:alert(1)", "/")).toBe("/");
    expect(safeBackTo("", "/fallback")).toBe("/fallback");
    expect(safeBackTo(null, "/fallback")).toBe("/fallback");
  });
});
