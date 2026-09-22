import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/app/login");
  await page.evaluate(() => window.__tasktips_e2e?.mockLogin());
});

test("防抖窗口内从 A 切到 B 不串写，新建后再切换也不串写", async ({ page }) => {
  const ids = await page.evaluate(async () => {
    const { content } = await import("/app/src/content/index.ts");
    const { useSyncStore } = await import("/app/src/stores/sync.ts");
    await useSyncStore().getEngine("navigation-test").setAutoSync(false);
    const a = await content.createTodo("navigation-test", { body: "ORIGINALA" });
    const b = await content.createTodo("navigation-test", { body: "ORIGINALB" });
    return [a.id, b.id];
  });
  await page.goto(`/app/p/navigation-test/todo/${ids[0]}`);
  const prose = page.locator(".editor-content .ProseMirror").first();
  await expect(prose).toContainText("ORIGINALA");
  await prose.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("SAVEDA");
  await page.locator(".editor-task-list .task-main").filter({ hasText: "ORIGINALB" }).click();
  await expect(prose).toContainText("ORIGINALB");
  const read = () =>
    page.evaluate(async () => {
      const { content } = await import("/app/src/content/index.ts");
      return (await content.listTodos("navigation-test")).map(
        (todo: { id: string; body: string }) => [todo.id, todo.body.trim()],
      );
    });
  expect(await read()).toEqual(
    expect.arrayContaining([
      [ids[0], "ORIGINALASAVEDA"],
      [ids[1], "ORIGINALB"],
    ]),
  );
  await page.evaluate(async () => {
    const { router } = await import("/app/src/app/router.ts");
    await router.push("/p/navigation-test/todo/new");
  });
  await expect(prose).toBeVisible();
  await prose.click();
  await page.keyboard.insertText("NEWTASK");
  await expect(page).toHaveURL(/\/todo\/[0-9A-HJ-KM-NP-TV-Z]{26}(?:[?#]|$)/);
  await page.locator(".editor-task-list .task-main").filter({ hasText: "ORIGINALB" }).click();
  await expect(prose).toContainText("ORIGINALB");
  await prose.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("EDITEDB");
  await page.locator(".editor-task-list .task-main").filter({ hasText: "ORIGINALA" }).click();
  expect(await read()).toEqual(expect.arrayContaining([[ids[1], "ORIGINALBEDITEDB"]]));
  expect((await read()).filter((item: string[]) => item[1] === "NEWTASK")).toHaveLength(1);
});

test("全局设置与备份沿用非 demo 项目", async ({ page }) => {
  await page.evaluate(async () => {
    const { useProjectStore } = await import("/app/src/stores/project.ts");
    const { router } = await import("/app/src/app/router.ts");
    const created = await useProjectStore().create("真实项目");
    await router.push(`/p/${created.id}/inbox`);
    await router.push("/settings?section=storage");
  });
  await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
  const project = await page.evaluate(async () => {
    const { useSyncStore } = await import("/app/src/stores/sync.ts");
    return useSyncStore().currentProjectId;
  });
  expect(project).not.toBe("demo");
  await expect(page.locator(`a[href="/app/p/${project}/inbox"]`)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目备份" }).click();
  expect((await download).suggestedFilename()).toContain(project);
});

test("真实 Web Locks 下 generation 和认证重试完成且不残留等待锁", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SyncEngine } = await import("/app/src/sync/engine.ts");
    const { SyncError } = await import("/app/src/sync/protocol.ts");
    const { MockSyncServer } = await import("/app/src/api/mockSync.ts");
    const { DexieContent } = await import("/app/src/content/dexie.ts");
    const content = new DexieContent(() => "lock-test", "lock-regression");
    const server = new MockSyncServer();
    let refreshes = 0;
    const engine = new SyncEngine({
      content,
      server,
      projectId: "lock-project",
      userId: "lock-test",
      deviceId: () => "dev",
      refreshSession: async () => {
        refreshes++;
        return true;
      },
    });
    try {
      await engine.syncNow();
      server.bumpGeneration("lock-project");
      const generation = await engine.syncNow();
      server.failNext = () => new SyncError("AUTHENTICATION_REQUIRED", "expired");
      const auth = await engine.syncNow();
      return { generation, auth, refreshes, locks: await navigator.locks.query() };
    } finally {
      await content.deleteDatabase();
    }
  });
  expect(result.generation).toBe("synced");
  expect(result.auth).toBe("synced");
  expect(result.refreshes).toBe(1);
  expect(result.locks.pending?.filter((lock) => lock.name?.includes("lock-test"))).toEqual([]);
});
