import { Blob as NodeBlob } from "node:buffer";
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DexieContent } from "@/content/dexie";
import { MockSyncServer } from "@/api/mockSync";
import { HttpSyncServer } from "@/api/httpSync";
import { SyncEngine } from "./engine";
import { SyncError, type PushRequest } from "./protocol";
import { parseTodoDoc, serializeTodo, sha256Hex, todoFromDoc } from "./serialize";

const databases: DexieContent[] = [];
function setup(user = "alice") {
  let activeUser = user;
  const content = new DexieContent(() => activeUser, `regression-${crypto.randomUUID()}`);
  databases.push(content);
  const server = new MockSyncServer();
  server.reset();
  const deps = {
    content,
    server,
    userId: user,
    projectId: "p",
    deviceId: () => "device-a",
    online: () => true,
  };
  return {
    content,
    server,
    deps,
    engine: new SyncEngine(deps),
    switchUser: (next: string) => {
      activeUser = next;
    },
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const db of databases.splice(0)) await db.deleteDatabase();
});

describe("审查回归：同步与持久化", () => {
  it("延迟的旧账号 payload 在失效后不会写入任一账号", async () => {
    const { content, server, engine, switchUser } = setup();
    const payload = "---\nid: secret\n---\nALICE_PRIVATE\n";
    const hash = await sha256Hex(payload);
    await server.putPayload(hash, payload);
    server.remoteWrite("p", "todo", "secret", hash);
    let release!: () => void;
    let downloaded!: () => void;
    const reached = new Promise<void>((resolve) => {
      downloaded = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(server, "getPayload").mockImplementation(async () => {
      downloaded();
      await blocked;
      return payload;
    });
    const syncing = engine.syncNow({ manual: true });
    await reached;
    engine.invalidate();
    switchUser("bob");
    release();
    expect(await syncing).toBe("error");
    expect(await content.listTodos("p")).toEqual([]);
    expect(await content.getSyncState("p")).toBeNull();
    expect(await content.forUser("alice").listTodos("p")).toEqual([]);
  });

  it("关闭自动同步后脏内容、冲突及拒绝项仍计入待同步", async () => {
    const { content, engine } = setup();
    await engine.syncNow({ manual: true });
    await engine.setAutoSync(false);
    expect(await engine.getPendingCount()).toBe(0);
    await content.createTodo("p", { body: "离线新任务" });
    expect(await engine.getPendingCount()).toBe(1);
    const state = await engine.getState();
    state.conflicts.push({
      kind: "todo",
      id: "conflict",
      localRevision: 1,
      remoteRevision: 2,
      remoteDeleted: false,
      detectedAt: "now",
    });
    state.rejected.push({
      kind: "image",
      id: "rejected.png",
      code: "VALIDATION_ERROR",
      revision: 1,
    });
    await content.putSyncState("p", JSON.stringify(state));
    expect(await engine.getPendingCount()).toBe(3);
  });

  it("下载分类后新建不会覆盖已有 ID，也不丢失同步元数据", async () => {
    const { content, engine } = setup();
    await engine.syncNow({ manual: true });
    await engine.setAutoSync(false);
    const existing = await content.createTag("p", { name: "已有标签" });
    const categories = await content.listCategories("p");
    await content.replaceClassification("p", categories, [{ ...existing, id: "tag-1" }]);
    const state = await content.getSyncState("p");
    const created = await content.createTag("p", { name: "新设备标签" });
    await content.createCategory("p", { name: "新设备目录", parentId: null });
    expect(created.id).not.toBe("tag-1");
    expect((await content.listTags("p")).map((tag) => tag.name)).toEqual(
      expect.arrayContaining(["已有标签", "新设备标签"]),
    );
    expect(await content.getSyncState("p")).toBe(state);
  });

  it("认证刷新与 generation 重试不重入独占锁且最多刷新一次", async () => {
    const { server, deps } = setup();
    let held = false;
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_name: string, callback: () => Promise<unknown>) => {
          if (held) throw new Error("递归获取同一把锁");
          held = true;
          try {
            return await callback();
          } finally {
            held = false;
          }
        },
      },
    });
    const refreshSession = vi.fn(async () => true);
    const engine = new SyncEngine({ ...deps, refreshSession });
    server.failNext = () => new SyncError("AUTHENTICATION_REQUIRED", "expired");
    expect(await engine.syncNow()).toBe("synced");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    server.bumpGeneration("p");
    expect(await engine.syncNow()).toBe("synced");
    vi.spyOn(server, "pull").mockRejectedValue(new SyncError("AUTHENTICATION_REQUIRED", "expired"));
    expect(await engine.syncNow({ manual: true })).toBe("auth");
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it("失效账号与撤销设备不尝试刷新", async () => {
    const { server, deps } = setup();
    const refreshSession = vi.fn(async () => true);
    const engine = new SyncEngine({ ...deps, refreshSession });
    server.failNext = () => new SyncError("DEVICE_REVOKED", "revoked");
    expect(await engine.syncNow()).toBe("auth");
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("图片使用文件名同步并恢复 images/ 引用，拒绝项不无限重推", async () => {
    const { content, server, engine } = setup();
    vi.stubGlobal("Blob", NodeBlob);
    await content.putImage(
      "p",
      "images/picture.png",
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    );
    const push = vi.spyOn(server, "push");
    expect(await engine.syncNow({ manual: true })).toBe("synced");
    expect(
      push.mock.calls
        .flatMap(([, request]) => request.objects)
        .filter((item) => item.kind === "image")
        .map((item) => item.id),
    ).toEqual(["picture.png"]);
    const other = setup("bob");
    const engineB = new SyncEngine({ ...other.deps, server });
    expect(await engineB.syncNow({ manual: true })).toBe("synced");
    expect((await other.content.listImages("p")).map((image) => image.path)).toEqual([
      "images/picture.png",
    ]);
    await content.putImage("p", "images/rejected.png", new Blob(["image"]));
    server.forceReject = { kind: "image", id: "rejected.png", code: "VALIDATION_ERROR" };
    expect(await engine.syncNow({ manual: true })).toBe("partial");
  });

  it("旧版失败图片请求在升级后按文件名重新提交", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    const { content, server, engine } = setup();
    await content.putImage("p", "images/old.png", new Blob(["image"]));
    server.failPushNext = () => new SyncError("NETWORK_ERROR", "offline");
    await engine.syncNow({ manual: true });
    const state = await engine.getState();
    state.pending!.objects.find((item) => item.kind === "image")!.id = "images/old.png";
    await content.putSyncState("p", JSON.stringify(state));
    const push = vi.spyOn(server, "push");
    expect(await engine.syncNow({ manual: true })).toBe("synced");
    expect(
      push.mock.calls
        .flatMap(([, request]) => request.objects)
        .filter((item) => item.kind === "image")
        .map((item) => item.id),
    ).toEqual(["old.png"]);
  });

  it("HTTP 请求跨重试、重启保持同一字节与设备", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init: RequestInit) => {
        bodies.push(String(init.body));
        return new Response(JSON.stringify({ results: [] }));
      }),
    );
    const request: PushRequest = {
      requestId: "immutable",
      generation: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
      deviceId: "original",
      objects: [{ kind: "image", id: "pic.png", baseRevision: 0, revision: 1, hash: "hash" }],
      tombstones: [],
    };
    await new HttpSyncServer({
      projectId: "p",
      getToken: () => "token",
      deviceId: () => "first",
    }).push("p", request);
    await new HttpSyncServer({
      projectId: "p",
      getToken: () => "new-token",
      deviceId: () => "second",
    }).push("p", JSON.parse(JSON.stringify(request)));
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[0]).objects[0].deviceId).toBe("original");
  });

  it("已确认的多次本地保存不与下一次远端修改或删除冲突", async () => {
    const { content, server, engine } = setup();
    const target = await content.createTodo("p", { body: "初始" });
    for (let i = 0; i < 5; i++) await content.updateTodo("p", target.id, { body: `修改${i}` });
    await engine.syncNow({ manual: true });
    const current = (await content.listTodos("p"))[0];
    const bytes = serializeTodo({ ...current, body: "远端修改", revision: 20 }, "device-b");
    const hash = await sha256Hex(bytes);
    await server.putPayload(hash, bytes);
    server.remoteWrite("p", "todo", target.id, hash);
    expect(await engine.syncNow({ manual: true })).toBe("synced");
    expect((await content.listTodos("p"))[0].body).toBe("远端修改");
    server.remoteDelete("p", "todo", target.id);
    expect(await engine.syncNow({ manual: true })).toBe("synced");
    expect(await content.listTodos("p")).toEqual([]);
  });

  it("另一个标签页已读取旧状态时仍采用最新持久基线", async () => {
    const { content, deps, engine } = setup();
    await content.createTodo("p", { body: "共享任务" });
    const other = new SyncEngine(deps);
    await other.getState();
    await engine.syncNow({ manual: true });
    expect(await other.syncNow({ manual: true })).toBe("synced");
    expect((await other.getState()).conflicts).toEqual([]);
    await engine.setAutoSync(false);
    expect((await other.getState()).autoSync).toBe(false);
  });

  it.each(["清空", "到期"])("回收站%s产生墓碑并传播到另一个设备", async (mode) => {
    const { content, server, engine } = setup();
    const target = await content.createTodo("p", { body: "应彻底删除" });
    await engine.syncNow({ manual: true });
    const second = setup("bob");
    const other = new SyncEngine({ ...second.deps, server });
    await other.syncNow({ manual: true });
    if (mode === "清空") {
      await content.deleteTodo("p", target.id);
      await content.emptyTrash("p");
    } else {
      await content.upsertTodoRemote("p", { ...target, deletedAt: "2000-01-01T00:00:00.000Z" });
      await content.listTodos("p");
    }
    expect((await content.getPendingTombstones("p")).map((item) => item.id)).toContain(target.id);
    await engine.syncNow({ manual: true });
    expect(await other.syncNow({ manual: true })).toBe("synced");
    expect(await second.content.listTodos("p")).toEqual([]);
  });
});

describe("完整 YAML 文档", () => {
  it("升级前的本地任务保持原有哈希，不产生虚假未同步修改", () => {
    const raw = [
      "---",
      "id: old-task",
      "title: 旧任务",
      "status: open",
      "priority: 0",
      "tags:",
      "",
      'createdAt: "2026-09-01T00:00:00.000Z"',
      'updatedAt: "2026-09-01T00:00:00.000Z"',
      "revision: 4",
      "deviceId: old-device",
      "schemaVersion: 1",
      "custom: keep",
      "---",
      "旧任务",
      "",
    ].join("\n");
    const { source: _source, ...legacyTodo } = todoFromDoc("old-task", parseTodoDoc(raw), 4);
    expect(serializeTodo(legacyTodo, "old-device")).toBe(raw);
  });
  it("复杂未知字段、块标量之后的元数据均保留，未编辑时字节不变", () => {
    const raw =
      "---\r\nid: task\r\n# 注释\r\ncustom:\r\n  nested: [1, true, hello]\r\nnotes: |\r\n  line one\r\n  line two\r\nstatus: completed\r\npriority: 3\r\ntags: [工作, 学习]\r\ndueDate: 2026-09-30\r\n---\r\n# 正文\r\n";
    const todo = todoFromDoc("task", parseTodoDoc(raw), 1);
    expect(todo.status).toBe("completed");
    expect(todo.tags).toEqual(["工作", "学习"]);
    expect(todo.dueDate).toBe("2026-09-30");
    expect(serializeTodo(todo, "other")).toBe(raw);
    const edited = parseTodoDoc(serializeTodo({ ...todo, body: "修改正文" }, "other"));
    expect(edited.extra).toEqual({
      custom: { nested: [1, true, "hello"] },
      notes: "line one\nline two\n",
    });
    expect(edited.fields.status).toBe("completed");
  });
  it.each(["status: [open", "status: open\nstatus: completed", "schemaVersion: 9", "tags: 123"])(
    "拒绝错误 YAML/schema：%s",
    (fields) => {
      expect(() => parseTodoDoc(`---\n${fields}\n---\ntext`)).toThrow(SyncError);
    },
  );
});
