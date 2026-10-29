// Server-side error tracking (https://docs.sentry.io/platforms/javascript/guides/nextjs/).
// Disabled entirely until SENTRY_DSN is set. Client-side capture needs the
// next.config.ts wrapper; add it only when the DSN is on.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? process.env.DEPLOY_ENV ?? process.env.NODE_ENV,
      // People data must not leave the app: no user info from instrumentation, no
      // cookies/headers/bodies. Sensitive values inside URLs (tokens) are filtered
      // from query params by default.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
      },
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
