import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
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
    enabled: process.env.NODE_ENV === "production",
    window: 60,
    max: 30,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
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
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
