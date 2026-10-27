import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("csv", () => {
  it("quotes and escapes cells and neutralizes formulas", () => {
    const out = toCsv([["a,b", 'say "hi"', "=SUM(A1)", 5, null]]);
    expect(out).toBe('﻿"a,b","say ""hi""",\'=SUM(A1),5,\r\n');
  });
});
