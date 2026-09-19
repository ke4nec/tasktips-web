import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import { MockSyncServer } from "@/api/mockSync";
import { DexieContent } from "@/content/dexie";
import { serializeTodo, sha256Hex } from "@/sync/serialize";
import { SyncEngine } from "@/sync/engine";
import { SyncError } from "@/sync/protocol";

let seq = 0;

function setup() {
  seq += 1;
  const content = new DexieContent(() => "u", `tasktips-sync-test-${seq}`);
  const server = new MockSyncServer();
  let counter = 0;
  const engine = new SyncEngine({
    content,
    server,
    deviceId: () => "dev-1",
    projectId: "demo",
    userId: "u",
    online: () => true,
    randomId: () => `r${++counter}`,
  });
  return { content, server, engine };
}

describe("同步引擎", () => {
  it("首次同步上传本地种子并达成已同步", async () => {
    const { content, server, engine } = setup();
    try {
      const status = await engine.syncNow({ manual: true });
      expect(status).toBe("synced");
      expect(server.inspect("demo").objects).toBeGreaterThan(0);
      const state = await engine.getState();
      expect(state.bootstrapped).toBe(true);
      expect(state.pending).toBeNull();
    } finally {
      await content.deleteDatabase();
    }
  });

  it("远端写入后增量拉取落地", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      const payload = [
        "---",
        "id: t-remote",
        "status: open",
        "priority: 1",
        "tags:",
        "createdAt: 2026-09-01T00:00:00.000Z",
        "updatedAt: 2026-09-01T00:00:00.000Z",
        "revision: 1",
        "deviceId: dev-2",
        "schemaVersion: 1",
        "---",
        "# 远端任务",
        "",
      ].join("\n");
      const hash = await sha256Hex(payload);
      await server.putPayload(hash, payload);
      server.remoteWrite("demo", "todo", "t-remote", hash);
      const status = await engine.syncNow({ manual: true });
      expect(status).toBe("synced");
      const todos = await content.listTodos("demo");
      expect(todos.map((todo) => todo.id)).toContain("t-remote");
    } finally {
      await content.deleteDatabase();
    }
  });

  it("双端编辑进入冲突，保留本机可收敛", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      const todos = await content.listTodos("demo");
      const target = todos.find((todo) => !todo.deletedAt);
      if (!target) throw new Error("缺少种子任务");
      await content.updateTodo("demo", target.id, { body: "# 本机修改" });
      const remotePayload = [
        "---",
        `id: ${target.id}`,
        "status: open",
        "priority: 0",
        "tags:",
        "createdAt: 2026-09-01T00:00:00.000Z",
        "updatedAt: 2026-09-02T00:00:00.000Z",
        "revision: 9",
        "deviceId: dev-2",
        "schemaVersion: 1",
        "---",
        "# 远端修改",
        "",
      ].join("\n");
      const remoteHash = await sha256Hex(remotePayload);
      await server.putPayload(remoteHash, remotePayload);
      server.remoteWrite("demo", "todo", target.id, remoteHash);
      const status = await engine.syncNow({ manual: true });
      expect(status).toBe("conflict");
      const state = await engine.getState();
      expect(state.conflicts).toHaveLength(1);
      expect(state.conflicts[0].remoteDeleted).toBe(false);

      await engine.resolveKeepLocal("todo", target.id);
      const after = await engine.getState();
      expect(after.conflicts).toHaveLength(0);
      const current = (await content.listTodos("demo")).find((todo) => todo.id === target.id);
      expect(current?.body).toBe("# 本机修改");
    } finally {
      await content.deleteDatabase();
    }
  });

  it("冲突采用远端覆盖本机", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      const todos = await content.listTodos("demo");
      const target = todos.find((todo) => !todo.deletedAt);
      if (!target) throw new Error("缺少种子任务");
      await content.updateTodo("demo", target.id, { body: "# 本机修改" });
      const remotePayload = [
        "---",
        `id: ${target.id}`,
        "status: open",
        "priority: 0",
        "tags:",
        "createdAt: 2026-09-01T00:00:00.000Z",
        "updatedAt: 2026-09-02T00:00:00.000Z",
        "revision: 9",
        "deviceId: dev-2",
        "schemaVersion: 1",
        "---",
        "# 远端修改",
        "",
      ].join("\n");
      const remoteHash = await sha256Hex(remotePayload);
      await server.putPayload(remoteHash, remotePayload);
      server.remoteWrite("demo", "todo", target.id, remoteHash);
      await engine.syncNow({ manual: true });
      await engine.resolveUseRemote("todo", target.id);
      const current = (await content.listTodos("demo")).find((todo) => todo.id === target.id);
      expect(current?.body).toBe("# 远端修改");
      expect((await engine.getState()).conflicts).toHaveLength(0);
    } finally {
      await content.deleteDatabase();
    }
  });

  it("远端删除与本机编辑冲突，采用远端移除本机", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      const todos = await content.listTodos("demo");
      const target = todos.find((todo) => !todo.deletedAt);
      if (!target) throw new Error("缺少种子任务");
      await content.updateTodo("demo", target.id, { body: "# 本机编辑" });
      server.remoteDelete("demo", "todo", target.id);
      const status = await engine.syncNow({ manual: true });
      expect(status).toBe("conflict");
      const conflict = (await engine.getState()).conflicts[0];
      expect(conflict.remoteDeleted).toBe(true);
      await engine.resolveUseRemote("todo", target.id);
      expect(
        (await content.listTodos("demo")).find((todo) => todo.id === target.id),
      ).toBeUndefined();
    } finally {
      await content.deleteDatabase();
    }
  });

  it("墓碑跨端传播：本机彻底删除同步到新端", async () => {
    const first = setup();
    const secondContent = new DexieContent(() => "u2", `tasktips-sync-test-${Date.now()}-b`);
    // 同一服务端、两个独立本地库。
    const secondEngine = new SyncEngine({
      content: secondContent,
      server: first.server,
      deviceId: () => "dev-2",
      projectId: "demo",
      userId: "u2",
      online: () => true,
      randomId: () => "x",
    });
    try {
      await first.engine.syncNow({ manual: true });
      const todos = await first.content.listTodos("demo");
      const target = todos.find((todo) => !todo.deletedAt);
      if (!target) throw new Error("缺少种子任务");
      await first.content.purgeTodo("demo", target.id);
      await first.engine.syncNow({ manual: true });
      await secondEngine.syncNow({ manual: true });
      // 第二端 bootstrap（含墓碑）后无该任务
      expect(
        (await secondContent.listTodos("demo")).find((todo) => todo.id === target.id),
      ).toBeUndefined();
    } finally {
      await first.content.deleteDatabase();
      await secondContent.deleteDatabase();
    }
  });

  it("push 响应丢失原 requestId 幂等重试", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      const todos = await content.listTodos("demo");
      await content.updateTodo("demo", todos[0].id, { body: "# 新编辑" });
      server.failPushNext = () => new SyncError("NETWORK_ERROR", "连接中断");
      const failed = await engine.syncNow({ manual: true });
      expect(failed).toBe("error");
      const pending = (await engine.getState()).pending;
      expect(pending).not.toBeNull();
      const status = await engine.syncNow({ manual: true });
      expect(status).toBe("synced");
      // 首次同步 1 个请求 + 重试的请求只记录一次 = 2（失败那次未落库）。
      expect(server.inspect("demo").requests).toBe(2);
    } finally {
      await content.deleteDatabase();
    }
  });

  it("单项拒绝不阻断其他对象，修改后重试", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      const todos = (await content.listTodos("demo")).filter((todo) => !todo.deletedAt);
      await content.updateTodo("demo", todos[0].id, { body: "# 改动一" });
      await content.updateTodo("demo", todos[1].id, { body: "# 改动二" });
      server.forceReject = { kind: "todo", id: todos[0].id, code: "PAYLOAD_TOO_LARGE" };
      const status = await engine.syncNow({ manual: true });
      expect(status).toBe("partial");
      expect((await engine.getState()).rejected.map((item) => item.id)).toContain(todos[0].id);
      await content.updateTodo("demo", todos[0].id, { body: "# 改动一修订版" });
      const retry = await engine.syncNow({ manual: true });
      expect(retry).toBe("synced");
    } finally {
      await content.deleteDatabase();
    }
  });

  it("游标失效自动重新初始化", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      const state = await engine.getState();
      // 模拟服务端日志裁剪后旧游标失效
      state.cursor = "9999";
      await content.putSyncState("demo", JSON.stringify(state));
      const status = await engine.syncNow();
      expect(status).toBe("synced");
      expect((await engine.getState()).bootstrapped).toBe(true);
      void server;
    } finally {
      await content.deleteDatabase();
    }
  });

  it("generation 变化自动重新初始化", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      server.bumpGeneration("demo");
      const todos = await content.listTodos("demo");
      await content.updateTodo("demo", todos[0].id, { body: "# 代次变化后的编辑" });
      const status = await engine.syncNow();
      expect(status).toBe("synced");
      expect((await engine.getState()).generation).toBe(2);
      // 本机改动保留并上传
      const current = (await content.listTodos("demo")).find((todo) => todo.id === todos[0].id);
      expect(current?.body).toBe("# 代次变化后的编辑");
    } finally {
      await content.deleteDatabase();
    }
  });

  it("可重试错误退避，手动同步不受限", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      server.failNext = () => new SyncError("SERVER_ERROR", "服务端繁忙");
      expect(await engine.syncNow()).toBe("error");
      const state = await engine.getState();
      expect(state.backoffUntil).toBeGreaterThan(Date.now());
      // 退避期内自动跳过
      expect(await engine.syncNow()).toBe("error");
      // 手动不受限
      expect(await engine.syncNow({ manual: true })).toBe("synced");
    } finally {
      await content.deleteDatabase();
    }
  });

  it("维护中暂停提交，手动恢复", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      server.failNext = () => new SyncError("PROJECT_MAINTENANCE", "项目维护中");
      expect(await engine.syncNow({ manual: true })).toBe("maintenance");
      // 非手动跳过提交
      expect(await engine.syncNow()).toBe("maintenance");
    } finally {
      await content.deleteDatabase();
    }
  });
});

describe("序列化服务器哈希一致", () => {
  it("上传 payload 与信封哈希一致", async () => {
    const { content, server, engine } = setup();
    try {
      await engine.syncNow({ manual: true });
      const todos = await content.listTodos("demo");
      const target = todos.find((todo) => !todo.deletedAt);
      if (!target) throw new Error("缺少种子任务");
      const bytes = serializeTodo(target, "dev-1");
      expect(await server.hasPayload(await sha256Hex(bytes))).toBe(true);
    } finally {
      await content.deleteDatabase();
    }
  });
});
