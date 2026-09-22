import "fake-indexeddb/auto";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { content } from "@/content";
import { performLogout } from "@/app/logout";
import { SyncError } from "@/sync/protocol";
import { DEMO_EMAIL } from "@/api/mock";
import { useSessionStore } from "@/stores/session";
import { mockSyncServer, useSyncStore } from "@/stores/sync";

describe("统一退出流程", () => {
  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    mockSyncServer.reset();
    await useSessionStore().mockLoginQuick();
  });

  it("退出前同步失败时保留会话和本地内容", async () => {
    const sync = useSyncStore();
    await sync.ensureProject("demo");
    const todo = await content.createTodo("demo", { body: "# 待同步内容" });
    mockSyncServer.failPushNext = () => new SyncError("NETWORK_ERROR", "连接中断");

    await expect(performLogout("sync", "demo")).rejects.toThrow("退出前同步未完成");
    expect(useSessionStore().isAuthenticated).toBe(true);
    expect((await content.listTodos("demo")).some((item) => item.id === todo.id)).toBe(true);

    await content.clearUserData(DEMO_EMAIL);
  });
});
