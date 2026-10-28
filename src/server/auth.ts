import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink, twoFactor } from "better-auth/plugins";
import { prisma } from "./db";
import { layout, sendEmail } from "./email";

export const auth = betterAuth({
  appName: "ClockTime",
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your ClockTime password",
        html: layout(
          "Reset your password",
          "<p>Someone asked to reset your ClockTime password. If it was you, use the button below. The link expires in 1 hour.</p>",
          {
            label: "Reset password",
            url,
          },
        ),
        text: `Reset your ClockTime password: ${url}`,
      });
    },
  },
  user: {
    additionalFields: {
      activeCompanyId: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    // Tests sign in many times a minute; never disable this in a real deployment.
    enabled: process.env.NODE_ENV === "production" && process.env.AUTH_RATE_LIMIT !== "off",
    window: 60,
    max: 30,
    // Serverless instances don't share memory: keep the counters in Postgres.
    storage: "database",
    modelName: "authRateLimit",
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // A link would skip the authenticator code, so 2FA accounts sign in with password + code.
        // Tell them by email rather than in the response, which would reveal who has 2FA on.
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (user?.twoFactorEnabled) {
          await sendEmail({
            to: email,
            subject: "Sign in to ClockTime with your password",
            html: layout(
              "Use your password and authenticator",
              "<p>Someone asked for a sign-in link for your account. Your account uses two-step verification, so email links are turned off: sign in with your password and the code from your authenticator app.</p>",
            ),
            text: "Your account uses two-step verification, so email sign-in links are turned off. Sign in with your password and authenticator code.",
          });
          return;
        }
        await sendEmail({
          to: email,
          subject: "Your ClockTime sign-in link",
          html: layout(
            "Sign in to ClockTime",
            "<p>Use the button below to sign in. The link expires in 5 minutes.</p>",
            {
              label: "Sign in",
              url,
            },
          ),
          text: `Sign in to ClockTime: ${url}`,
        });
      },
    }),
    twoFactor({
      issuer: "ClockTime",
      // Admins scan the code and must confirm one valid code before 2FA turns on.
      skipVerificationOnEnable: false,
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
