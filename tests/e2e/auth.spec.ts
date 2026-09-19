import { test, expect, type Page } from "@playwright/test";

async function loginAsDemo(page: Page) {
  await page.goto("/app/login");
  await page.getByLabel("邮箱").fill("demo@example.com");
  await page.getByLabel("密码", { exact: true }).fill("Demo12345678");
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

test("登录全流程：成功后单项目直接进入今日", async ({ page }) => {
  await loginAsDemo(page);
  await expect(page).toHaveURL(/\/app\/p\/demo\/today/);
  await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();
});

test("错误密码显示明确错误", async ({ page }) => {
  await page.goto("/app/login");
  await page.getByLabel("邮箱").fill("demo@example.com");
  await page.getByLabel("密码", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("邮箱或密码不正确");
});

test("邀请链接预填凭据并激活进入", async ({ page }) => {
  await page.goto("/app/register#invitation=demo-invitation-token");
  await expect(page.getByLabel("邀请凭据")).toHaveValue("demo-invitation-token");
  // 凭据从地址栏移除，仅保留在当前注册会话
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toContain("invitation");
  await page.getByLabel("新密码", { exact: true }).fill("NewPassword123");
  await page.getByLabel("确认新密码").fill("NewPassword123");
  await page.getByRole("button", { name: "激活并进入" }).click();
  await expect(page).toHaveURL(/\/app\/p\/.+\/today/);
});

test("无效邀请拒绝且不建号", async ({ page }) => {
  await page.goto("/app/register");
  await page.getByLabel("邀请凭据").fill("bad-token");
  await page.getByLabel("新密码", { exact: true }).fill("NewPassword123");
  await page.getByLabel("确认新密码").fill("NewPassword123");
  await page.getByRole("button", { name: "激活并进入" }).click();
  await expect(page.getByRole("alert")).toContainText("请联系管理员");
});

test("密码规则在提交前校验", async ({ page }) => {
  await page.goto("/app/register");
  await page.getByLabel("邀请凭据").fill("demo-invitation-token");
  await page.getByLabel("新密码", { exact: true }).fill("short");
  await page.getByLabel("确认新密码").fill("different");
  await page.getByRole("button", { name: "激活并进入" }).click();
  await expect(page.getByRole("alert")).toContainText("至少 12 个字符");
});

test("新建项目并进入", async ({ page }) => {
  await loginAsDemo(page);
  await page.goto("/app/projects");
  await page.getByRole("button", { name: "新建项目" }).first().click();
  await page.getByLabel("项目名称").fill("阅读与学习");
  await page.getByRole("button", { name: "创建并进入" }).click();
  await expect(page).toHaveURL(/\/app\/p\/.+\/today/);
  await expect(page.getByRole("link", { name: /阅读与学习/ })).toBeVisible();
});

test("退出登录回到登录页", async ({ page }) => {
  await loginAsDemo(page);
  await page.goto("/app/projects");
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("button", { name: "确认退出" }).click();
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  // 会话已清：再进业务页回到登录
  await page.goto("/app/projects");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
});
