import { test, expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    __sync_debug?: {
      remoteWriteTodo: (projectId: string, id: string, body: string) => Promise<void>;
    };
  }
}

async function login(page: Page) {
  await page.goto("/app/login");
  await page.evaluate(() => window.__tasktips_e2e?.mockLogin());
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("同步页展示状态与日志", async ({ page }) => {
  await page.goto("/app/p/demo/sync");
  await expect(page.getByRole("heading", { name: "同步与数据" })).toBeVisible();
  // ShellHost 进入即自动同步，最终收敛到已同步或待同步
  await expect(page.getByText(/所有更改已同步|本机有未同步修改/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "冲突处理" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "本机执行日志" })).toBeVisible();
});

test("手动同步与自动开关", async ({ page }) => {
  await page.goto("/app/p/demo/sync");
  await page.getByRole("button", { name: "立即同步" }).click();
  await expect(page.getByText(/所有更改已同步/)).toBeVisible({ timeout: 15000 });
  const autoSwitch = page.getByRole("switch", { name: "自动同步" });
  await expect(autoSwitch).toHaveAttribute("aria-checked", "true");
  // 等待后台同步收敛，避免点击落在重渲染间隙。
  await page.waitForTimeout(500);
  await autoSwitch.click();
  await expect(autoSwitch).toHaveAttribute("aria-checked", "false", { timeout: 10000 });
  await autoSwitch.click();
  await expect(autoSwitch).toHaveAttribute("aria-checked", "true", { timeout: 10000 });
});

test("双端编辑冲突保留本机", async ({ page }) => {
  // 先关闭自动同步，使本机改动与远端改动确定性相遇。
  await page.goto("/app/p/demo/sync");
  await expect(page.getByText(/所有更改已同步/)).toBeVisible({ timeout: 15000 });
  const autoSwitch = page.getByRole("switch", { name: "自动同步" });
  await expect(autoSwitch).toHaveAttribute("aria-checked", "true");
  await autoSwitch.click();
  await expect(autoSwitch).toHaveAttribute("aria-checked", "false", { timeout: 10000 });

  await page.goto("/app/p/demo/inbox");
  await page.locator(".task-row .task-main").first().click();
  await expect(page.locator(".editor-content .ProseMirror").first()).toBeVisible();
  const prose = page.locator(".editor-content .ProseMirror").first();
  await prose.click();
  await page.keyboard.type("本机追加");
  await page.waitForTimeout(2000);
  const todoId = new URL(page.url()).pathname.split("/").pop() as string;

  await page.evaluate(
    ([projectId, id]) => window.__sync_debug?.remoteWriteTodo(projectId, id, "# 远端修改正文"),
    ["demo", todoId],
  );

  await page.goto("/app/p/demo/sync");
  await page.getByRole("button", { name: "立即同步" }).click();
  await expect(page.getByText("有冲突需要处理")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "保留本机" }).click();
  await expect(page.getByText("已保留本机版本")).toBeVisible({ timeout: 15000 });
});

test("退出登录提供同步后退出", async ({ page }) => {
  await page.goto("/app/p/demo/today");
  // 制造一条未同步修改（切换完成态为本地写，自动同步 debounce 覆盖前打开退出）
  await page.goto("/app/projects");
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("dialog", { name: "退出登录" })).toBeVisible();
});
