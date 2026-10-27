import { expect, test } from "@playwright/test";

test("demo owner can sign in and reach the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@demo.clocktime.ph");
  await page.getByLabel("Password").fill("demo12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByText("Kape Kanto Café").first()).toBeVisible();
});

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});
