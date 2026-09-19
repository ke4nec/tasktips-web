import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

import { useTodoStore } from "@/stores/todos";

describe("任务筛选状态", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("搜索去首尾空格", () => {
    const todos = useTodoStore();
    todos.setSearch("  散步  ");
    expect(todos.search).toBe("散步");
    expect(todos.filterCount()).toBe(1);
  });

  it("标签筛选大小写不敏感去重", () => {
    const todos = useTodoStore();
    todos.toggleTagFilter("工作");
    todos.toggleTagFilter("工作");
    expect(todos.tags).toEqual([]);
    todos.toggleTagFilter("工作");
    todos.toggleTagFilter("工作".toUpperCase());
    expect(todos.tags).toEqual([]);
  });

  it("清除筛选同时清除搜索并恢复默认排序", () => {
    const todos = useTodoStore();
    todos.setSearch("x");
    todos.toggleTagFilter("工作");
    todos.togglePriorityFilter(3);
    todos.setSort("title", "asc");
    todos.clearFilters();
    expect(todos.search).toBe("");
    expect(todos.tags).toEqual([]);
    expect(todos.priorities).toEqual([]);
    expect(todos.sort).toBeUndefined();
    expect(todos.filterCount()).toBe(0);
  });
});
