import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("cutoff report: pick a branch, preview and download the Excel workbook", async ({ page }) => {
  await login(page, "owner@demo.clocktime.ph");
  await page.goto("/app/reports");
  await expect(page.getByRole("heading", { name: "Cutoff attendance report" })).toBeVisible();
  // Pro plan: one branch at a time (consolidated nationwide reports are Enterprise).
  await expect(page.getByText("Choose a branch to see its report.")).toBeVisible();
  await page.getByLabel("Branch").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Apply filters" }).click();
  const excel = page.getByRole("link", { name: "Excel workbook" });
  await expect(excel).toBeVisible();
  const res = await page.request.get((await excel.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("spreadsheetml");
  const csv = await page.request.get(
    (await page.getByRole("link", { name: "Daily DTR CSV" }).getAttribute("href"))!,
  );
  expect(await csv.text()).toContain("OT Approved (h)");
});
