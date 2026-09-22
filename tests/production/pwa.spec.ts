import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/app/login");
  await page.getByLabel("邮箱").fill("production-test@example.com");
  await page.getByLabel("密码", { exact: true }).fill("TestPassword123");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/production-project\/today/);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

async function workerVersion(page: Page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return new Promise<string>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => resolve(event.data);
      registration.active!.postMessage("get-version", [channel.port2]);
    });
  });
}

test("首次访问完整预缓存，CSP 允许主题脚本，断网重开可编辑本地任务", async ({ page, context }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) cspErrors.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem("tasktips:theme-preference", "dark"));
  await login(page);
  expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
  const resources = await page.evaluate(async () => {
    const keys = (await caches.keys()).filter((key) => key.startsWith("tasktips-web-"));
    const cache = await caches.open(keys[0]);
    return (await cache.keys()).map((request) => request.url);
  });
  expect(resources.some((url) => /assets\/.*\.js$/.test(url))).toBe(true);
  expect(resources.some((url) => /assets\/.*\.css$/.test(url))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "今日", exact: true })).toBeVisible();
  await page.locator(".content").getByRole("button", { name: "新建任务" }).click();
  const prose = page.locator(".editor-content .ProseMirror").first();
  await expect(prose).toBeVisible();
  await prose.click();
  await page.keyboard.insertText("离线保存的生产任务");
  await expect(page).toHaveURL(/\/todo\/[0-9A-HJ-KM-NP-TV-Z]{26}(?:[?#]|$)/);
  await page.reload();
  await expect(prose).toContainText("离线保存的生产任务");
  expect(cspErrors).toEqual([]);
});

test("点击更新激活等待中的新 SW，保存编辑内容后刷新", async ({ page, request }) => {
  await login(page);
  const oldVersion = await workerVersion(page);
  await page.locator(".content").getByRole("button", { name: "新建任务" }).click();
  const prose = page.locator(".editor-content .ProseMirror").first();
  await expect(prose).toBeVisible();
  await prose.click();
  await page.keyboard.insertText("更新前草稿");
  await expect(page).toHaveURL(/\/todo\/[0-9A-HJ-KM-NP-TV-Z]{26}(?:[?#]|$)/);
  await request.get("/__test/update");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });
  await expect(page.getByRole("button", { name: "立即更新" })).toBeVisible();
  await prose.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("_刷新前输入");
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "立即更新" }).click(),
  ]);
  await expect(prose).toContainText("更新前草稿_刷新前输入");
  expect(await workerVersion(page)).not.toBe(oldVersion);
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting === null),
  ).toBe(true);
});
