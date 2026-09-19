import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/app/login");
  await page.evaluate(() => window.__tasktips_e2e?.mockLogin());
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("设置分区分导航", async ({ page }) => {
  await page.goto("/app/settings");
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await page.getByRole("button", { name: "账号与安全" }).click();
  await expect(page.getByRole("button", { name: "确认更新" })).toBeVisible();
  await page.getByRole("button", { name: "登录设备" }).click();
  await expect(page.getByText("当前浏览器")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "存储与备份" }).click();
  await expect(page.getByRole("button", { name: "导出项目备份" })).toBeVisible();
});

test("改密后需重新登录", async ({ page }) => {
  await page.goto("/app/settings?section=account");
  await page.getByLabel("当前密码").fill("Demo12345678");
  await page.getByLabel("新密码（至少 12 字符）").fill("NewPassword1234");
  await page.getByLabel("确认新密码").fill("NewPassword1234");
  await page.getByRole("button", { name: "确认更新" }).click();
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible({ timeout: 10000 });
  // 新密码可登录（同页 Mock 会话）
  await page.getByLabel("邮箱").fill("demo@example.com");
  await page.getByLabel("密码", { exact: true }).fill("NewPassword1234");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/p\/.+\/today/);
});

test("设备重命名", async ({ page }) => {
  await page.goto("/app/settings?section=devices");
  await expect(page.getByText("当前浏览器")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "重命名" }).first().click();
  await page.getByRole("dialog").getByLabel("设备名称").fill("主力浏览器");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("主力浏览器")).toBeVisible();
});

test("历史记录查看版本", async ({ page }) => {
  await page.goto("/app/p/demo/history");
  await expect(page.locator(".timeline-row").first()).toBeVisible({ timeout: 20000 });
  await page.locator(".timeline-row").first().getByRole("button", { name: "查看版本" }).click();
  await expect(page.getByRole("dialog", { name: /历史版本/ })).toBeVisible();
});

test("快照创建与恢复流程", async ({ page }) => {
  await page.goto("/app/p/demo/snapshots");
  await page.getByRole("button", { name: "创建快照" }).first().click();
  await page
    .getByRole("dialog")
    .getByLabel(/快照说明/)
    .fill("E2E基线");
  await page.getByRole("dialog").getByRole("button", { name: "创建快照" }).click();
  await expect(page.getByText("E2E基线")).toBeVisible();
  await page.getByRole("button", { name: "恢复到此快照" }).first().click();
  await page
    .getByRole("dialog")
    .getByLabel(/恢复原因/)
    .fill("E2E回滚验证");
  await page.getByRole("dialog").getByRole("button", { name: "开始恢复" }).click();
  await expect(page.getByText("项目已恢复，准备重新接入")).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("dialog", { name: "重新接入恢复后的项目" })
    .getByRole("button", { name: "继续" })
    .click();
  await expect(page).toHaveURL(/\/app\/p\/demo\/sync/);
});

test("备份导出与恢复", async ({ page }) => {
  await page.goto("/app/settings?section=storage");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目备份" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  await page.locator('input[type="file"]').setInputFiles(backupPath as string);
  await expect(page.getByRole("dialog", { name: "确认覆盖本地内容" })).toBeVisible();
  await expect(page.getByText(/条任务/)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "恢复备份" }).click();
  await expect(page.getByText("备份已恢复")).toBeVisible({ timeout: 15000 });
});
