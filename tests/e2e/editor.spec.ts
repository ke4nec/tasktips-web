import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/app/login");
  await page.evaluate(() => window.__tasktips_e2e?.mockLogin());
}

async function openEditor(page: Page) {
  await page.goto("/app/p/demo/today");
  await page.locator(".content").getByRole("button", { name: "新建任务" }).click();
  await expect(page).toHaveURL(/\/app\/p\/demo\/todo\/new/);
  await expect(page.locator(".editor-content .ProseMirror").first()).toBeVisible();
}

async function typeInInstant(page: Page, text: string) {
  const prose = page.locator(".editor-content .ProseMirror").first();
  await prose.click();
  await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("新建任务自动保存并落库", async ({ page }) => {
  await openEditor(page);
  await typeInInstant(page, "# E2E编辑标题\n\n正文第一行");
  // 落库即创建路由替换，是持久化成功的最强信号（保存标签 idle/已保存同文案）。
  await expect(page).toHaveURL(/\/app\/p\/demo\/todo\/t-/, { timeout: 15000 });
  await expect(page.locator(".editor-titlebar h1")).toContainText("E2E编辑标题");
});

test("即时→分栏→即时内容一致", async ({ page }) => {
  await openEditor(page);
  await typeInInstant(page, "# 往返标题\n\n- [ ] 清单项");
  await expect(page).toHaveURL(/\/app\/p\/demo\/todo\/t-/, { timeout: 15000 });

  await page.getByRole("button", { name: "分栏", exact: true }).click();
  const source = page.locator(".source-editor-host .cm-content");
  await expect(source).toContainText("往返标题");
  // 预览只读呈现
  await expect(page.locator(".preview-pane .ProseMirror")).toContainText("往返标题");

  await page.getByRole("button", { name: "即时", exact: true }).click();
  await expect(page.locator(".editor-content .ProseMirror").first()).toContainText("往返标题");
});

test("跨模式撤销与重做", async ({ page }) => {
  await openEditor(page);
  await typeInInstant(page, "第一版");
  await expect(page).toHaveURL(/\/app\/p\/demo\/todo\/t-/, { timeout: 15000 });

  await page.getByRole("button", { name: "分栏", exact: true }).click();
  const source = page.locator(".source-editor-host .cm-content");
  await source.click();
  await page.keyboard.type("追加");
  await page.getByRole("button", { name: "即时", exact: true }).click();
  await expect(page.locator(".editor-content .ProseMirror").first()).toContainText("追加");

  const undo = page.getByRole("button", { name: "撤销" });
  const redo = page.getByRole("button", { name: "重做" });
  await expect(undo).toBeEnabled({ timeout: 10000 });
  await undo.click();
  await expect(page.locator(".editor-content .ProseMirror").first()).not.toContainText("追加");
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.locator(".editor-content .ProseMirror").first()).toContainText("追加");
});

test("元数据与完成切换", async ({ page }) => {
  await page.goto("/app/p/demo/inbox");
  await page.locator(".task-row .task-main").first().click();
  await expect(page.locator(".editor-content .ProseMirror").first()).toBeVisible();

  await page
    .getByRole("button", { name: /优先级/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "优先级" });
  await dialog.getByLabel("优先级").selectOption("3");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("button", { name: /高优先级/ })).toBeVisible();

  await page.getByRole("button", { name: "标记完成" }).click();
  await expect(page.getByRole("button", { name: /重新打开/ })).toBeVisible();
});

test("图片导入插入本地引用", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "分栏", exact: true }).click();
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  await page.locator('input[type="file"]').setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: head,
  });
  await expect(page.locator(".source-editor-host .cm-content")).toContainText("images/");
});
