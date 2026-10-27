import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("kiosk: pair a tablet and punch with a PIN", async ({ browser }) => {
  const admin = await browser.newPage();
  await login(admin, "owner@demo.clocktime.ph");
  await admin.goto("/app/settings/kiosks");
  await admin.getByRole("button", { name: "Add kiosk" }).click();
  await admin.getByRole("button", { name: "Get pairing code" }).click();
  const code = (await admin.getByTestId("pairing-code").textContent())!.trim();

  const kiosk = await (await browser.newContext()).newPage();
  await kiosk.goto("/kiosk");
  await kiosk.getByLabel("Pairing code").fill(code);
  await kiosk.getByRole("button", { name: "Pair kiosk" }).click();
  await expect(kiosk.getByText("Enter your PIN or scan your badge")).toBeVisible();

  // Wrong PIN
  for (const d of "9999") await kiosk.getByRole("button", { name: d, exact: true }).click();
  await kiosk.getByRole("button", { name: "Enter" }).click();
  await expect(kiosk.getByText("PIN or badge not recognized.")).toBeVisible();

  // Grace Villanueva = PIN 1007 (seed)
  for (const d of "1007") await kiosk.getByRole("button", { name: d, exact: true }).click();
  await kiosk.getByRole("button", { name: "Enter" }).click();
  await expect(kiosk.getByText("Hi, Grace!")).toBeVisible();
  const clockIn = kiosk.getByRole("button", { name: "Clock in" });
  if (await clockIn.isVisible()) {
    await clockIn.click();
    await expect(kiosk.getByText(/Clocked in\. Have a great shift, Grace!/)).toBeVisible();
  } else {
    await kiosk.getByRole("button", { name: "Clock out" }).click();
    await expect(kiosk.getByText(/Clocked out\. Salamat, Grace!/)).toBeVisible();
  }
});

test("leave: employee requests, manager approves", async ({ browser }) => {
  const emp = await browser.newPage();
  await login(emp, "mark@demo.clocktime.ph");
  await emp.goto("/me/leave");
  await emp.getByLabel("Type").selectOption({ label: "Unpaid leave" });
  // A different future day on every run (minute-based), so reruns on the same database don't overlap.
  // Moved to a Tuesday–Thursday so it is never a rest day.
  const d = new Date(Date.now() + (40 + (Math.floor(Date.now() / 60_000) % 20_000)) * 86_400_000);
  while (d.getUTCDay() < 2 || d.getUTCDay() > 4) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toISOString().slice(0, 10);
  await emp.getByLabel("From").fill(day);
  await emp.getByLabel("To").fill(day);
  await emp.getByLabel("Reason (optional)").fill("e2e test");
  await emp.getByRole("button", { name: "Send request" }).click();
  await expect(emp.getByText("Request sent to your manager.")).toBeVisible();

  const mgr = await (await browser.newContext()).newPage();
  await login(mgr, "owner@demo.clocktime.ph");
  await mgr.goto("/app/leave");
  const row = mgr
    .locator("li", { hasText: "Mark Bautista · Unpaid leave" })
    .filter({ hasText: "e2e test" })
    .first();
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(mgr.getByText("Leave approved.")).toBeVisible();
});

test("exceptions inbox resolves an item", async ({ page }) => {
  await login(page, "owner@demo.clocktime.ph");
  await page.goto("/app/exceptions");
  const first = page.getByRole("button", { name: "Resolve", exact: true }).first();
  test.skip(!(await first.isVisible()), "No open exceptions in this database");
  const before = await page.getByRole("button", { name: "Resolve", exact: true }).count();
  await first.click();
  await expect(page.getByText("Marked resolved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resolve", exact: true })).toHaveCount(before - 1);
});
