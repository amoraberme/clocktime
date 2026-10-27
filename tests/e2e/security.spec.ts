import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as authenticator apps compute it. */
function totp(base32: string, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

test("an owner turns on two-step verification and signs in with a backup code", async ({ page, context }) => {
  const email = `twofa-${Date.now()}@e2e.test`;
  const password = "supersecret1";
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Tess Ocampo");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Business name").fill("Ocampo Security Agency");
  await page.getByLabel("Location name").fill("Head office");
  await page.getByRole("button", { name: "Create my company" }).click();
  await expect(page).toHaveURL(/\/app\?welcome=1/);

  await page.goto("/me/profile");
  await page.getByLabel("Your password").fill(password);
  await page.getByRole("button", { name: "Set up" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  const backup = (await page.getByTestId("backup-codes").textContent())!.trim().split(/\s+/)[0]!;
  await page.getByLabel(/Enter the 6-digit code/).fill(totp(secret));
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Signing in asks for a code")).toBeVisible();

  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/two-factor/);
  await page.getByRole("button", { name: "Use a backup code" }).click();
  await page.getByLabel("Backup code").fill(backup);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app/);
});
