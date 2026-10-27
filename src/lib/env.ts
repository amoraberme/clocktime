import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().min(1),
  CRON_SECRET: z.string().default(""),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("ClockTime <no-reply@example.com>"),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.string().default(""),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default(""),
  S3_ACCESS_KEY_ID: z.string().default(""),
  S3_SECRET_ACCESS_KEY: z.string().default(""),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:support@example.com"),
  PAYMONGO_SECRET_KEY: z.string().default(""),
  PAYMONGO_PUBLIC_KEY: z.string().default(""),
  PAYMONGO_WEBHOOK_SECRET: z.string().default(""),
  SUPER_ADMIN_EMAILS: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Read lazily so builds don't need runtime secrets. */
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
