import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DexieContent } from "@/content/dexie";

let seq = 0;
let content: DexieContent;

beforeEach(() => {
  seq += 1;
  content = new DexieContent(() => "test-user", `tasktips-web-test-${seq}`);
});

afterEach(async () => {
  await content.deleteDatabase();
});

describe("内容仓储（§4.2 生命周期，Dexie）", () => {
  it("目录删除展示影响数量，同批恢复不复活早先单独删除", async () => {
    const solo = await content.createTodo("demo", { body: "单独删除的任务" });
    await content.deleteTodo("demo", solo.id);
    const cat = await content.createCategory("demo", { name: "测试目录", parentId: null });
    const inner = await content.createTodo("demo", { body: "目录内任务", categoryId: cat.id });
    const impact = await content.deleteCategory("demo", cat.id);
    expect(impact).toEqual({ categories: 1, todos: 1 });

    const trash = await content.listTrash("demo");
    expect(trash.todos.map((item) => item.id)).toContain(solo.id);
    expect(trash.todos.map((item) => item.id)).toContain(inner.id);

    const result = await content.restoreCategory("demo", cat.id);
    expect(result.restoredTodos).toBe(1);
    expect(result.conflicts).toEqual([]);
    const after = await content.listTrash("demo");
    expect(after.todos.map((item) => item.id)).toContain(solo.id);
    expect(after.todos.map((item) => item.id)).not.toContain(inner.id);
  });

  it("恢复同名冲突保留回收站条目", async () => {
    const cat = await content.createCategory("demo", { name: "冲突目录", parentId: null });
    await content.deleteCategory("demo", cat.id);
    await content.createCategory("demo", { name: "冲突目录", parentId: null });
    const result = await content.restoreCategory("demo", cat.id);
    expect(result.conflicts).toEqual(["冲突目录"]);
    const trash = await content.listTrash("demo");
    expect(trash.categories.map((item) => item.id)).toContain(cat.id);
  });

  it("标签软删除保留引用，彻底删除移除引用，重命名更新全部任务", async () => {
    const tag = await content.createTag("demo", { name: "待办" });
    const seeded = (await content.listTodos("demo")).filter((todo) => !todo.deletedAt);
    await content.updateTodo("demo", seeded[0].id, { tags: ["待办"] });
    await content.deleteTag("demo", tag.id);
    expect(
      (await content.listTodos("demo")).find((todo) => todo.id === seeded[0].id)?.tags,
    ).toEqual(["待办"]);
    await content.restoreTag("demo", tag.id);
    await content.renameTag("demo", tag.id, "已办");
    expect(
      (await content.listTodos("demo")).find((todo) => todo.id === seeded[0].id)?.tags,
    ).toEqual(["已办"]);
    await content.deleteTag("demo", tag.id);
    await content.purgeTag("demo", tag.id);
    expect(
      (await content.listTodos("demo")).find((todo) => todo.id === seeded[0].id)?.tags,
    ).toEqual([]);
  });

  it("目录/标签名校验与移动约束", async () => {
    await expect(
      content.createCategory("demo", { name: "x", parentId: null }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(content.createTag("demo", { name: "" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    const a = await content.createCategory("demo", { name: "AA目录", parentId: null });
    const b = await content.createCategory("demo", { name: "BB目录", parentId: a.id });
    await expect(content.moveCategory("demo", a.id, b.id)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("命名空间隔离与持久化", () => {
  it("不同用户数据隔离", async () => {
    const other = new DexieContent(() => "other-user", `tasktips-web-test-${seq}`);
    await content.createTodo("demo", { body: "甲的任务" });
    expect((await other.listTodos("demo")).some((todo) => todo.title === "甲的任务")).toBe(false);
    await other.deleteDatabase();
  });

  it("同库新实例读取已持久化内容", async () => {
    const name = `tasktips-web-test-${seq}-persist`;
    const first = new DexieContent(() => "test-user", name);
    const created = await first.listTodos("demo");
    expect(created.length).toBeGreaterThan(0);
    await first.db.close();
    const second = new DexieContent(() => "test-user", name);
    const reloaded = await second.listTodos("demo");
    expect(reloaded).toHaveLength(created.length);
    // 空项目不重复播种：删光后仍为空
    for (const todo of reloaded) await second.purgeTodo("demo", todo.id);
    expect(await second.listTodos("demo")).toHaveLength(0);
    await second.deleteDatabase();
  });

  it("图片记录存取（路径往返；字节级往返由真机 E2E 覆盖）", async () => {
    // 说明：fake-indexeddb 无法识别 happy-dom 的 Blob 实现，结构化克隆后仅保留类型字段；
    // 真实浏览器中原生 Blob 往返正常，编辑器图片 E2E 在 Chromium 中验证展示链路。
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    await content.putImage("demo", "images/x.png", blob);
    const images = await content.listImages("demo");
    expect(images.map((image) => image.path)).toContain("images/x.png");
    const stored = images.find((image) => image.path === "images/x.png")?.blob;
    expect(stored).toBeDefined();
    expect((stored as unknown as { type?: string }).type).toBe("image/png");
  });
});

describe("快照与恢复副本", () => {
  it("导出导入往返，导入前自动保留副本", async () => {
    const snapshot = await content.exportSnapshot("demo");
    expect(snapshot.version).toBe(1);
    expect(snapshot.todos.length).toBeGreaterThan(0);
    await content.purgeTodo("demo", snapshot.todos[0].id);
    expect((await content.listTodos("demo")).length).toBe(snapshot.todos.length - 1);
    await content.importSnapshot("demo", snapshot);
    expect((await content.listTodos("demo")).length).toBe(snapshot.todos.length);
    // purge 与 import 各留一个恢复副本
    expect((await content.listRecoveries("demo")).length).toBeGreaterThanOrEqual(2);
  });

  it("恢复副本可恢复可删除", async () => {
    const before = (await content.listTodos("demo")).length;
    const copy = await content.stashRecovery("demo", "手动副本");
    await content.createTodo("demo", { body: "临时任务" });
    expect((await content.listTodos("demo")).length).toBe(before + 1);
    await content.restoreRecovery("demo", copy.id);
    expect((await content.listTodos("demo")).length).toBe(before);
    await content.deleteRecovery("demo", copy.id);
    expect(
      (await content.listRecoveries("demo")).find((item) => item.id === copy.id),
    ).toBeUndefined();
  });

  it("非法快照拒绝且不动现状", async () => {
    const before = await content.listTodos("demo");
    await expect(content.importSnapshot("demo", { version: 2 } as never)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect((await content.listTodos("demo")).length).toBe(before.length);
  });
});
