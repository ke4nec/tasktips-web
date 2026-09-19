import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/app/login");
  await page.evaluate(() => window.__tasktips_e2e?.mockLogin());
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("今日视图分组展示过期与今天", async ({ page }) => {
  await page.goto("/app/p/demo/today");
  await expect(page.getByRole("heading", { name: /已过期/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /今天/ })).toBeVisible();
  await expect(page.getByText("核对多端同步的交互细节")).toBeVisible();
});

test("完成任务后移出今日并提示", async ({ page }) => {
  await page.goto("/app/p/demo/today");
  // 直接派发 change 事件：勾选后列表重载会替换 DOM，click/check 的可操作等待会竞态超时。
  const checkbox = page.getByRole("checkbox", { name: /核对多端同步/ }).first();
  await checkbox.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByRole("status")).toContainText("又完成了一件小事");
  await expect(page.getByText("核对多端同步的交互细节")).toHaveCount(0);
});

test("搜索过滤与清除筛选", async ({ page }) => {
  await page.goto("/app/p/demo/inbox");
  await page.getByRole("searchbox", { name: "搜索任务" }).fill("散步");
  await expect(page.getByText("傍晚散步 30 分钟")).toBeVisible();
  await expect(page.getByText("核对多端同步的交互细节")).toHaveCount(0);
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.getByText("核对多端同步的交互细节")).toBeVisible();
});

test("筛选弹层按截止日期过滤", async ({ page }) => {
  await page.goto("/app/p/demo/inbox");
  await page.getByRole("button", { name: "筛选" }).click();
  await page.getByLabel("截止日期").selectOption("today");
  await page.getByRole("button", { name: "应用筛选" }).click();
  await expect(page.getByText("完善 TaskTips Web 设计稿")).toBeVisible();
  await expect(page.getByText("傍晚散步 30 分钟")).toHaveCount(0);
});

test("目录新建与删除进回收站", async ({ page }) => {
  await page.goto("/app/p/demo/classification");
  await page.getByRole("button", { name: "新建目录" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("名称", { exact: true }).fill("E2E目录");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const row = page.locator(".folder-row", { hasText: "E2E目录" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "删除" }).click();
  await page.getByRole("button", { name: "移入回收站" }).click();
  await expect(row).toHaveCount(0);

  // 站内导航（内存 Mock 跳页即失，整页刷新会重置演示数据）。
  await page.locator("aside").getByRole("link", { name: "回收站" }).click();
  await page.getByRole("tab", { name: /目录/ }).click();
  await expect(page.getByText("E2E目录")).toBeVisible();
});

test("回收站恢复种子任务", async ({ page }) => {
  await page.goto("/app/p/demo/trash");
  await expect(page.getByText("旧的草稿")).toBeVisible();
  const row = page.locator(".data-table tbody tr", { hasText: "旧的草稿" });
  await row.getByRole("button", { name: "恢复" }).click();
  await page.getByRole("button", { name: "确认" }).click();
  await expect(page.getByText("旧的草稿")).toHaveCount(0);
});

test("刷新后本地修改保留（Dexie 持久化）", async ({ page }) => {
  await page.goto("/app/p/demo/today");
  const checkbox = page.getByRole("checkbox", { name: /核对多端同步/ }).first();
  await checkbox.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByRole("status")).toContainText("又完成了一件小事");
  // 整页刷新：内存态丢失，会话经刷新仿真恢复，内容经 Dexie 恢复。
  await page.reload();
  await expect(page.getByRole("heading", { name: /今天/ })).toBeVisible();
  await expect(page.getByText("核对多端同步的交互细节")).toHaveCount(0);
  await page
    .locator("aside")
    .getByRole("link", { name: /已完成/ })
    .click();
  await expect(page.getByText("核对多端同步的交互细节")).toBeVisible();
});

test("侧栏显示视图计数与目录树", async ({ page }) => {
  await page.goto("/app/p/demo/today");
  const nav = page.getByRole("navigation", { name: "固定视图" });
  await expect(nav.getByRole("link", { name: /今日/ })).toContainText("2");
  await expect(page.locator("aside").getByRole("button", { name: /产品设计/ })).toBeVisible();
});
