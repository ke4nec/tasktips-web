import "fake-indexeddb/auto";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { content } from "@/content";
import { mockSyncServer } from "@/stores/sync";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";

describe("同步门面", () => {
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    mockSyncServer.reset();
    await useSessionStore().mockLoginQuick();
  });

  it("项目接入后自动同步达成已同步", async () => {
    const sync = useSyncStore();
    await sync.ensureProject("demo");
    expect(sync.status).toBe("synced");
    expect(sync.detail?.bootstrapped).toBe(true);
    await content.clearUserData("demo@example.com");
  });

  it("本地修改后手动同步恢复已同步", async () => {
    const sync = useSyncStore();
    await sync.ensureProject("demo");
    await content.createTodo("demo", { body: "# 门面测试任务" });
    await sync.syncNowManual("demo");
    expect(sync.status).toBe("synced");
    expect(sync.detail?.logs.length).toBeGreaterThan(0);
    await content.clearUserData("demo@example.com");
  });

  it("自动同步开关持久化", async () => {
    const sync = useSyncStore();
    await sync.ensureProject("demo");
    await sync.setAutoSync("demo", false);
    expect(sync.detail?.autoSync).toBe(false);
    await sync.setAutoSync("demo", true);
    expect(sync.detail?.autoSync).toBe(true);
    await content.clearUserData("demo@example.com");
  });
});
