import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __tasktips_e2e?: { mockLogin: (email?: string) => void; mockLogout: () => void };
  }
}

async function mockLogin(page: Page) {
  await page.goto("/app/login");
  await page.evaluate(() => window.__tasktips_e2e?.mockLogin());
}

test("首帧主题由 theme-boot 设置", async ({ page }) => {
  await page.goto("/app/login");
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(["light", "dark"]).toContain(theme);
});

test("未登录访问业务页回登录", async ({ page }) => {
  await page.goto("/app/projects");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
});

test("登录后进入工作台：侧栏导航与顶栏可用", async ({ page }) => {
  await mockLogin(page);
  await page.goto("/app/p/demo/today");
  await expect(page.getByRole("link", { name: "TaskTips" })).toBeVisible();
  await expect(page.getByRole("link", { name: /今日/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "新建", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "搜索任务或命令" }),
  ).toBeVisible();
});

test("主题切换后刷新仍保持", async ({ page }) => {
  await mockLogin(page);
  await page.goto("/app/p/demo/today");
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole("button", { name: "切换深色/浅色主题" }).click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
});

test("命令面板可导航到收件箱", async ({ page }) => {
  await mockLogin(page);
  await page.goto("/app/p/demo/today");
  await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByPlaceholder("搜索…").fill("收件箱");
  const option = page.getByRole("option", { name: /打开收件箱/ });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/\/app\/p\/demo\/inbox/);
  await expect(page.getByRole("heading", { name: "收件箱" })).toBeVisible();
});

test("移动端抽屉导航可开关", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/app/login");
  await page.evaluate(() => window.__tasktips_e2e?.mockLogin());
  await page.goto("/app/p/demo/today");
  await page.getByRole("button", { name: "打开导航" }).click();
  await expect(page.locator(".app-shell.nav-open")).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-shell.nav-open")).toHaveCount(0);
  await context.close();
});
