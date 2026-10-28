import { z } from "zod";

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    DIRECT_DATABASE_URL: z.string().default(""),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    APP_URL: z.string().url().default("http://localhost:3000"),
    BETTER_AUTH_SECRET: z.string().min(32),
    DATA_ENCRYPTION_KEY: z.string().min(1),
    CRON_SECRET: z.string().default(""),
    EMAIL_PROVIDER: z.enum(["console", "resend", "smtp"]).default("console"),
    /** smtp://user:pass@host:587 (smtps:// for TLS on 465). Mailpit locally, any relay in production. */
    SMTP_URL: z.string().default(""),
    RESEND_API_KEY: z.string().default(""),
    EMAIL_FROM: z.string().default("ClockTime <no-reply@example.com>"),
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    S3_ENDPOINT: z.string().default(""),
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: z.string().default(""),
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    /** "true" for MinIO and other stores that need bucket-in-path URLs. */
    S3_FORCE_PATH_STYLE: z.string().default(""),
    /** Address browsers use for signed download links, when it differs from S3_ENDPOINT. */
    S3_PUBLIC_ENDPOINT: z.string().default(""),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().default(""),
    VAPID_PRIVATE_KEY: z.string().default(""),
    VAPID_SUBJECT: z.string().default("mailto:support@example.com"),
    PAYMONGO_SECRET_KEY: z.string().default(""),
    PAYMONGO_PUBLIC_KEY: z.string().default(""),
    PAYMONGO_WEBHOOK_SECRET: z.string().default(""),
    SUPER_ADMIN_EMAILS: z.string().default(""),
    NEXT_PUBLIC_SALES_EMAIL: z.string().default(""),
    BILLING_TEST_MODE: z.string().default(""),
    AUTH_RATE_LIMIT: z.string().default(""),
    /** "production" on the live deployment (Vercel sets VERCEL_ENV; elsewhere set DEPLOY_ENV). */
    VERCEL_ENV: z.string().default(""),
    DEPLOY_ENV: z.string().default(""),
  })
  .superRefine((e, ctx) => {
    if (e.VERCEL_ENV !== "production" && e.DEPLOY_ENV !== "production") return;
    // A live site must not silently fall back to development services.
    const need = (ok: boolean, message: string) => ok || ctx.addIssue({ code: "custom", message });
    need(e.APP_URL.startsWith("https://"), "APP_URL must be the public https:// address");
    need(e.CRON_SECRET.length >= 16, "CRON_SECRET must be set (16+ characters)");
    need(
      (e.EMAIL_PROVIDER === "resend" && !!e.RESEND_API_KEY) || (e.EMAIL_PROVIDER === "smtp" && !!e.SMTP_URL),
      "Set EMAIL_PROVIDER=resend with RESEND_API_KEY, or EMAIL_PROVIDER=smtp with SMTP_URL",
    );
    need(
      e.STORAGE_PROVIDER === "s3" && !!e.S3_BUCKET && !!e.S3_ACCESS_KEY_ID && !!e.S3_SECRET_ACCESS_KEY,
      "Set STORAGE_PROVIDER=s3 with S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
    );
    need(
      Buffer.from(e.DATA_ENCRYPTION_KEY, "base64").length === 32,
      "DATA_ENCRYPTION_KEY must be 32 bytes, base64",
    );
    need(!e.BILLING_TEST_MODE, "BILLING_TEST_MODE must not be set in production");
    need(e.AUTH_RATE_LIMIT !== "off", "AUTH_RATE_LIMIT=off must not be set in production");
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Check an environment without caching it (used by env() and the tests). */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const r = schema.safeParse(raw);
  if (!r.success)
    throw new Error(
      `Invalid environment:\n${r.error.issues.map((i) => `- ${i.path.join(".") || "config"}: ${i.message}`).join("\n")}`,
    );
  return r.data;
}

/** Validated server environment. Read lazily so builds don't need runtime secrets. */
export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
