import "fake-indexeddb/auto";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { content } from "@/content";
import { performLogout } from "@/app/logout";
import { SyncError } from "@/sync/protocol";
import { DEMO_EMAIL } from "@/api/mock";
import { useSessionStore } from "@/stores/session";
import { mockSyncServer, useSyncStore } from "@/stores/sync";
import { registerEditorPersistence } from "@/editor/persistence";

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

  it("同步后退出上传所有本地项目，再清理整个账号", async () => {
    await content.createTodo("project-a", { body: "A 的新任务" });
    await content.createTodo("project-b", { body: "B 的新任务" });
    await performLogout("sync", "project-a");
    expect(mockSyncServer.inspect("project-a").objects).toBe(3);
    expect(mockSyncServer.inspect("project-b").objects).toBe(3);
    expect(await content.forUser(DEMO_EMAIL).listLocalProjects()).toEqual([]);
    expect(useSessionStore().isAuthenticated).toBe(false);
  });

  it("编辑器保存失败时阻止退出和本机清理", async () => {
    const target = await content.createTodo("project-a", { body: "保留内容" });
    const unregister = registerEditorPersistence(async () => {
      throw new Error("保存失败");
    });
    try {
      await expect(performLogout("sync", "project-a")).rejects.toThrow("保存失败");
      expect(useSessionStore().isAuthenticated).toBe(true);
      expect((await content.listTodos("project-a"))[0].id).toBe(target.id);
    } finally {
      unregister();
      await content.clearUserData(DEMO_EMAIL);
    }
  });
});
