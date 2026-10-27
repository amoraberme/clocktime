import { expect, type Page } from "@playwright/test";

export const BGC = { latitude: 14.5509, longitude: 121.0509, accuracy: 10 };
export const MAGINHAWA = { latitude: 14.6417, longitude: 121.0577, accuracy: 10 };

export async function login(page: Page, email: string, password = "demo12345") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Make sure the employee starts clocked out (tests can be re-run against the same database). */
export async function ensureClockedOut(page: Page) {
  await page.goto("/me");
  const status = page.getByTestId("clock-status");
  await expect(status).toBeVisible();
  if (
    (await status.textContent())?.includes("on the clock") ||
    (await status.textContent())?.includes("break")
  ) {
    await page.getByRole("button", { name: "Clock out" }).click();
    await expect(status).toHaveText(/clocked out/);
  }
}
