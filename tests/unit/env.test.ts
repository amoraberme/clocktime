import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const KEY = Buffer.alloc(32, 7).toString("base64");
const base = {
  DATABASE_URL: "postgresql://u:p@db/clocktime",
  BETTER_AUTH_SECRET: "x".repeat(40),
  DATA_ENCRYPTION_KEY: KEY,
};
const live = {
  ...base,
  VERCEL_ENV: "production",
  APP_URL: "https://app.clocktime.ph",
  CRON_SECRET: "c".repeat(24),
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_123",
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
  S3_BUCKET: "clocktime",
  S3_ACCESS_KEY_ID: "id",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("environment", () => {
  it("accepts development defaults outside production", () => {
    const e = parseEnv(base);
    expect(e.EMAIL_PROVIDER).toBe("console");
    expect(e.DATABASE_POOL_MAX).toBe(5);
  });

  it("accepts a complete production configuration", () => {
    expect(parseEnv({ ...live, DATABASE_POOL_MAX: "8" }).DATABASE_POOL_MAX).toBe(8);
  });

  it("refuses development services and test switches in production", () => {
    expect(() => parseEnv({ ...live, EMAIL_PROVIDER: "console" })).toThrow(/RESEND_API_KEY/);
    expect(() => parseEnv({ ...live, STORAGE_PROVIDER: "local" })).toThrow(/STORAGE_PROVIDER=s3/);
    expect(() => parseEnv({ ...live, APP_URL: "http://app.clocktime.ph" })).toThrow(/https/);
    expect(() => parseEnv({ ...live, CRON_SECRET: "" })).toThrow(/CRON_SECRET/);
    expect(() => parseEnv({ ...live, BILLING_TEST_MODE: "1" })).toThrow(/BILLING_TEST_MODE/);
    expect(() => parseEnv({ ...live, AUTH_RATE_LIMIT: "off" })).toThrow(/AUTH_RATE_LIMIT/);
    expect(() => parseEnv({ ...live, DATA_ENCRYPTION_KEY: "short" })).toThrow(/32 bytes/);
    // DEPLOY_ENV covers hosts other than Vercel.
    expect(() =>
      parseEnv({ ...live, VERCEL_ENV: "", DEPLOY_ENV: "production", RESEND_API_KEY: "" }),
    ).toThrow();
  });
});
