import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("employee files a schedule change; the owner approves it in the inbox", async ({ browser }) => {
  const emp = await browser.newPage();
  await login(emp, "ana@demo.clocktime.ph");
  await emp.goto("/me/requests");
  await emp.getByLabel("Change", { exact: true }).selectOption("ADD");
  const reason = `e2e duty ${Date.now()}`;
  await emp.getByLabel("Reason").nth(1).fill(reason);
  await emp.getByRole("button", { name: "Send for approval" }).nth(1).click();
  await expect(emp.getByText("Schedule change sent for approval.")).toBeVisible();
  await expect(emp.getByTestId("my-request").first()).toContainText("pending");

  const owner = await (await browser.newContext()).newPage();
  await login(owner, "owner@demo.clocktime.ph");
  await owner.goto("/app/approvals");
  const item = owner.getByTestId("approval-item").filter({ hasText: reason });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(owner.getByText("Approved.")).toBeVisible();
  await expect(owner.getByTestId("approval-item").filter({ hasText: reason })).toHaveCount(0);
});
