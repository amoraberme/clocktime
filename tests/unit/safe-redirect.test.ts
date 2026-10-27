import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";

describe("safeNext", () => {
  it("allows relative paths and blocks external redirects", () => {
    expect(safeNext("/app/team")).toBe("/app/team");
    expect(safeNext("/join?code=ABC")).toBe("/join?code=ABC");
    expect(safeNext("https://evil.com")).toBe("/home");
    expect(safeNext("//evil.com")).toBe("/home");
    expect(safeNext("/\\evil.com")).toBe("/home");
    expect(safeNext(null, "/onboarding")).toBe("/onboarding");
  });
});
