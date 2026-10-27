import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("marketing pages render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Clock in, schedule and pay your team");
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Compare plans" })).toBeVisible();
  await page.goto("/legal/privacy");
  await expect(page.getByText("Data Privacy Act of 2012")).toBeVisible();
});

test("a trial company upgrades to Pro via checkout (test mode)", async ({ page }) => {
  const email = `bill-${Date.now()}@e2e.test`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Billie Cruz");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Business name").fill("Cruz Laundry");
  await page.getByRole("button", { name: "Create my company" }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByText(/days left in your Pro trial/)).toBeVisible();

  await page.goto("/app/settings/billing");
  await page.getByRole("button", { name: "Choose Pro" }).click();
  await expect(page.getByText("Test mode: PayMongo isn't configured")).toBeVisible();
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByText(/Pro, paid through/)).toBeVisible();
  await expect(page.getByText("days left in your Pro trial")).toHaveCount(0);
  await expect(page.getByText(/Paid/).first()).toBeVisible();
});

test("open redirects are blocked on login", async ({ page }) => {
  await login(page, "owner@demo.clocktime.ph");
  await page.goto("/login?next=https://example.org");
  await page.getByLabel("Email").fill("owner@demo.clocktime.ph");
  await page.getByLabel("Password").fill("demo12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/localhost/);
});
