import { describe, expect, it } from "vitest";
import { createWedgeDetector } from "@/lib/card-reader";
import { normalizeCard, normalizeUserId } from "@/lib/identifiers";
import {
  actionFor,
  handshakeOptions,
  methodFor,
  parseAttlog,
  parseCommandResults,
  parseLogFile,
  userInfoCommand,
} from "@/lib/terminal/adms";

describe("ZKTeco ADMS", () => {
  it("parses ATTLOG uploads", () => {
    const { records, bad } = parseAttlog(
      "1\t2026-10-13 07:52:11\t0\t1\t0\t0\t0\n0042\t2026-10-13 17:04:00\t1\t4\t\ngarbage\n",
    );
    expect(records).toEqual([
      { userId: "1", local: "2026-10-13 07:52:11", status: 0, verify: 1 },
      { userId: "0042", local: "2026-10-13 17:04:00", status: 1, verify: 4 },
    ]);
    expect(bad).toHaveLength(1);
  });

  it("maps verify codes and status keys", () => {
    expect(methodFor(1)).toBe("FINGERPRINT");
    expect(methodFor(4)).toBe("CARD");
    expect(methodFor(15)).toBe("FACE");
    expect(methodFor(0)).toBe("PIN");
    expect(actionFor(1, false)).toBe("TOGGLE");
    expect(actionFor(0, true)).toBe("CLOCK_IN");
    expect(actionFor(1, true)).toBe("CLOCK_OUT");
    expect(actionFor(255, true)).toBe("TOGGLE");
  });

  it("builds the handshake and user commands", () => {
    const opts = handshakeOptions("CQZ7232260002", { attlogStamp: "9999", tzOffsetHours: 8 });
    expect(opts.split("\n")[0]).toBe("GET OPTION FROM: CQZ7232260002");
    expect(opts).toContain("ATTLOGStamp=9999");
    expect(opts).toContain("TimeZone=8");
    expect(userInfoCommand({ userId: "42", name: "Dela Cruz, Maria\tX", card: "4100137" })).toBe(
      "DATA UPDATE USERINFO PIN=42\tName=Dela Cruz, Maria X\tPri=0\tPasswd=\tCard=4100137\tGrp=1\tTZ=0000000100000000\tVerify=0",
    );
    expect(parseCommandResults("ID=12&Return=0&CMD=DATA\nID=13&Return=-1002&CMD=DATA\n")).toEqual([
      { id: 12, returnCode: 0 },
      { id: 13, returnCode: -1002 },
    ]);
  });
});

describe("terminal log files", () => {
  it("reads a USB attlog.dat export", () => {
    const { records, errors } = parseLogFile(
      "        1\t2026-10-13 07:52:11\t1\t0\t1\t0\n       12\t2026-10-13 17:01:00\t1\t1\t1\t0\n",
    );
    expect(records.map((r) => [r.userId, r.local, r.action])).toEqual([
      ["1", "2026-10-13 07:52:11", "TOGGLE"],
      ["12", "2026-10-13 17:01:00", "TOGGLE"],
    ]);
    expect(errors).toHaveLength(0);
  });

  it("reads a CSV with headers, separate date and time and an in/out column", () => {
    const csv =
      'AC-No.,Name,Date,Time,State\n7,"Reyes, Ana",10/13/2026,7:58 AM,C/In\n7,"Reyes, Ana",10/13/2026,5:02 PM,C/Out\n';
    const { records } = parseLogFile(csv);
    expect(records.map((r) => [r.userId, r.local, r.action])).toEqual([
      ["7", "2026-10-13 07:58:00", "CLOCK_IN"],
      ["7", "2026-10-13 17:02:00", "CLOCK_OUT"],
    ]);
  });

  it("reports unreadable lines", () => {
    const { errors } = parseLogFile("PIN,DateTime\n1,not a date\n");
    expect(errors[0]!.line).toBe(2);
  });
});

describe("identifiers", () => {
  it("normalizes terminal IDs and card numbers", () => {
    expect(normalizeUserId("0042")).toBe("42");
    expect(normalizeUserId("emp7")).toBe("EMP7");
    expect(normalizeCard("0001234567")).toBe("1234567");
    expect(normalizeCard("04:a2:3b:1c")).toBe("04A23B1C");
  });
});

describe("keyboard-wedge card readers", () => {
  it("accepts a fast burst ending in Enter and ignores slow typing", () => {
    const cards: string[] = [];
    const key = createWedgeDetector({ onCard: (c) => cards.push(c) });
    let t = 1000;
    for (const k of [..."0012345678", "Enter"]) key(k, (t += 8));
    expect(cards).toEqual(["0012345678"]);
    for (const k of [..."1234", "Enter"]) key(k, (t += 400));
    expect(cards).toHaveLength(1);
  });
});
