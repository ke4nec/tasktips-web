import { test, expect } from "@playwright/test";

test("应用壳可访问", async ({ page }) => {
  await page.goto("/app/");
  await expect(page.getByRole("heading", { name: "TaskTips Web" })).toBeVisible();
});
