import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("admin runs, finalizes and pays payroll; employee sees the payslip", async ({ page, browser }) => {
  await login(page, "owner@demo.clocktime.ph");
  await page.goto("/app/payroll");
  await page.getByRole("button", { name: "Run payroll" }).click();
  const period = page.getByLabel("Pay period");
  // Pick an older period each time so reruns don't collide with a finalized one.
  const options = await period.locator("option").all();
  let chosen: string | null = null;
  for (const o of options) {
    const label = (await o.textContent()) ?? "";
    if (!label.includes("already started") && !label.includes("in progress")) {
      chosen = await o.getAttribute("value");
      break;
    }
  }
  test.skip(!chosen, "All recent periods already have pay runs in this database");
  await period.selectOption(chosen!);
  await page.getByRole("button", { name: "Calculate payroll" }).click();
  await expect(page).toHaveURL(/\/app\/payroll\/c/);
  // The salaried owner is always paid, whatever hours exist in this period.
  await expect(page.locator("summary", { hasText: "Maria Santos" })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Finalize" }).click();
  await expect(page.getByText(/Payroll finalized/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Mark as paid" }).click();
  await expect(page.getByText(/Marked paid/)).toBeVisible();

  const xlsx = await page.request.get(
    page.url().replace(/\/app\/payroll\/(.+)$/, "/api/export/payroll/$1?format=register-xlsx"),
  );
  expect(xlsx.ok()).toBe(true);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");

  const emp = await (await browser.newContext()).newPage();
  await login(emp, "ana@demo.clocktime.ph");
  await emp.goto("/me/payslips");
  const pdfLink = emp.getByRole("link", { name: "PDF" }).first();
  await expect(pdfLink).toBeVisible();
  const pdf = await emp.request.get((await pdfLink.getAttribute("href"))!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
});

test("public API spec is served", async ({ request }) => {
  const r = await request.get("/api/v1/openapi.json");
  expect((await r.json()).openapi).toBe("3.1.0");
  expect((await request.get("/api/v1/employees")).status()).toBe(401);
});
