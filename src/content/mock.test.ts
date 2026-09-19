import { beforeEach, describe, expect, it } from "vitest";

import { MockContent } from "@/content/mock";

describe("内容仓储（§4.2 生命周期）", () => {
  let content: MockContent;
  beforeEach(() => {
    content = new MockContent();
  });

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
    // 早先单独删除的不复活
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
    // 软删除保留引用
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
