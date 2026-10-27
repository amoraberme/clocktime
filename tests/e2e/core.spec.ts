import { expect, test } from "@playwright/test";
import { BGC, ensureClockedOut, login } from "./helpers";

test("a new owner signs up, sets up the company and adds a team member", async ({ page }) => {
  const email = `owner-${Date.now()}@e2e.test`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Rosa Dizon");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("supersecret1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Business name").fill("Dizon Bakery");
  await page.getByLabel("Location name").fill("Main bakery");
  await page.getByRole("button", { name: "Create my company" }).click();
  await expect(page).toHaveURL(/\/app\?welcome=1/);
  await expect(page.getByText("Your company is ready")).toBeVisible();

  await page.goto("/app/team");
  await page.getByRole("button", { name: "Add person" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("First name").fill("Ben");
  await dialog.getByLabel("Last name").fill("Ramos");
  await dialog.getByLabel("Rate (₱)").fill("650");
  await dialog.getByRole("button", { name: "Add to team" }).click();
  await expect(page.getByRole("heading", { name: "Ben Ramos" })).toBeVisible();
});

test.describe("employee clock", () => {
  test("geofence blocks far-away clock-ins, then allows on site", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await login(page, "paolo@demo.clocktime.ph");
    await ensureClockedOut(page);
    await context.setGeolocation({ latitude: 14.6, longitude: 121.0, accuracy: 10 });
    await page.getByRole("button", { name: "Clock in" }).click();
    await expect(page.getByText(/from BGC kiosk\. Move within/)).toBeVisible();
    await expect(page.getByTestId("clock-status")).toHaveText(/clocked out/);

    await context.setGeolocation(BGC);
    await page.getByRole("button", { name: "Clock in" }).click();
    await expect(page.getByTestId("clock-status")).toHaveText(/on the clock/);
    await page.getByRole("button", { name: "Break" }).click();
    await expect(page.getByTestId("clock-status")).toHaveText(/On break/);
    await page.getByRole("button", { name: "End break" }).click();
    await page.getByRole("button", { name: "Clock out" }).click();
    await expect(page.getByTestId("clock-status")).toHaveText(/clocked out/);
  });

  test("punches made offline are queued and synced", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(BGC);
    await login(page, "grace@demo.clocktime.ph");
    await ensureClockedOut(page);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Clock in" }).click();
    await expect(page.getByText("1 punch waiting to sync")).toBeVisible();
    await expect(page.getByTestId("clock-status")).toHaveText(/on the clock/);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText("waiting to sync")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("clock-status")).toHaveText(/on the clock/);
    await page.getByRole("button", { name: "Clock out" }).click();
    await expect(page.getByTestId("clock-status")).toHaveText(/clocked out/);
  });
});

test("manager approves a timesheet", async ({ page }) => {
  await login(page, "owner@demo.clocktime.ph");
  await page.goto("/app/timesheets");
  await page.getByRole("link", { name: "Liza Garcia" }).click();
  await expect(page.getByRole("heading", { name: "Liza Garcia" })).toBeVisible();
  const reopen = page.getByRole("button", { name: "Reopen" });
  if (await reopen.isVisible()) {
    await reopen.click();
    await expect(page.getByRole("button", { name: "Approve timesheet" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Approve timesheet" }).click();
  await expect(page.getByText(/Approved 1 timesheet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
});
