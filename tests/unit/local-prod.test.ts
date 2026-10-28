import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { cronMatches } from "@/lib/cron-match";
import { parseEnv } from "@/lib/env";

describe("local cron runner", () => {
  const at = (iso: string) => new Date(iso);
  it("matches the vercel.json schedules", () => {
    expect(cronMatches("*/15 * * * *", at("2026-10-28T01:30:00Z"))).toBe(true);
    expect(cronMatches("*/15 * * * *", at("2026-10-28T01:31:00Z"))).toBe(false);
    expect(cronMatches("17 18 * * *", at("2026-10-28T18:17:00Z"))).toBe(true);
    expect(cronMatches("17 18 * * *", at("2026-10-28T18:18:00Z"))).toBe(false);
    expect(cronMatches("0 9 * * 1-5", at("2026-10-31T09:00:00Z"))).toBe(false); // Saturday
    expect(cronMatches("0 9 * * 1-5", at("2026-10-30T09:00:00Z"))).toBe(true);
    expect(cronMatches("0 0 1,15 * *", at("2026-10-15T00:00:00Z"))).toBe(true);
    expect(cronMatches("0 0 * * 7", at("2026-11-01T00:00:00Z"))).toBe(true); // 7 = Sunday
    for (const job of JSON.parse(readFileSync("vercel.json", "utf8")).crons)
      expect(() => cronMatches(job.schedule, new Date())).not.toThrow();
    expect(() => cronMatches("* * *", new Date())).toThrow();
  });
});

describe("production email providers", () => {
  const live = {
    DATABASE_URL: "postgresql://u:p@db/x",
    BETTER_AUTH_SECRET: "x".repeat(40),
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    DEPLOY_ENV: "production",
    APP_URL: "https://app.example.ph",
    CRON_SECRET: "c".repeat(20),
    STORAGE_PROVIDER: "s3",
    S3_BUCKET: "b",
    S3_ACCESS_KEY_ID: "k",
    S3_SECRET_ACCESS_KEY: "s",
  };
  it("accepts SMTP with a URL and refuses it without one", () => {
    expect(
      parseEnv({ ...live, EMAIL_PROVIDER: "smtp", SMTP_URL: "smtps://u:p@smtp.example.ph:465" })
        .EMAIL_PROVIDER,
    ).toBe("smtp");
    expect(() => parseEnv({ ...live, EMAIL_PROVIDER: "smtp" })).toThrow(/SMTP_URL/);
  });
});

describe("S3 storage", () => {
  it("signs browser download links for the public endpoint, path-style", async () => {
    vi.resetModules();
    vi.stubEnv("STORAGE_PROVIDER", "s3");
    vi.stubEnv("S3_BUCKET", "clocktime-files");
    vi.stubEnv("S3_ENDPOINT", "http://s3:8333");
    vi.stubEnv("S3_PUBLIC_ENDPOINT", "http://localhost:8333");
    vi.stubEnv("S3_FORCE_PATH_STYLE", "true");
    vi.stubEnv("S3_REGION", "us-east-1");
    vi.stubEnv("S3_ACCESS_KEY_ID", "k");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "s");
    const { storage } = await import("@/server/storage");
    const url = new URL(await storage().url("payslips/abc.pdf"));
    expect(url.origin).toBe("http://localhost:8333");
    expect(url.pathname).toBe("/clocktime-files/payslips/abc.pdf");
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    vi.unstubAllEnvs();
  });
});
