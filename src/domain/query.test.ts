import { describe, expect, it } from "vitest";

import {
  expandCategoryIds,
  groupCompleted,
  groupToday,
  groupUpcoming,
  hasActiveFilter,
  runQuery,
  viewCounts,
  type QueryContext,
} from "@/domain/query";
import type { Category, Todo, TodoQuery } from "@/domain/types";

const TODAY = "2026-09-19";

function todo(partial: Partial<Todo> & { id: string }): Todo {
  return {
    title: partial.id,
    body: "",
    status: "open",
    priority: 0,
    tags: [],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-10T00:00:00Z",
    revision: 1,
    ...partial,
  };
}

const CATS: Category[] = [
  {
    id: "c1",
    name: "工作",
    parentId: null,
    color: "#8a8a8a",
    icon: "",
    description: "",
    orderIndex: 0,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  },
  {
    id: "c2",
    name: "项目",
    parentId: "c1",
    color: "#8a8a8a",
    icon: "",
    description: "",
    orderIndex: 0,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  },
];

function ctx(todos: Todo[], query?: Partial<QueryContext>): QueryContext {
  return { todos, categories: CATS, today: TODAY, customOrder: { inbox: [], all: [] }, ...query };
}

function run(todos: Todo[], query: TodoQuery, context?: Partial<QueryContext>): string[] {
  return runQuery(query, ctx(todos, context)).map((item) => item.id);
}

describe("视图谓词", () => {
  const todos = [
    todo({ id: "open-nodate" }),
    todo({ id: "overdue", dueDate: "2026-09-18" }),
    todo({ id: "today", dueDate: TODAY }),
    todo({ id: "future", dueDate: "2026-09-25" }),
    todo({ id: "done", status: "completed", completedAt: "2026-09-18T00:00:00Z" }),
    todo({ id: "trashed", deletedAt: "2026-09-18T00:00:00Z" }),
  ];

  it("inbox=全部未完成，普通视图排除回收站", () => {
    expect(run(todos, { view: "inbox" })).toEqual(
      expect.arrayContaining(["open-nodate", "overdue", "today", "future"]),
    );
    expect(run(todos, { view: "inbox" })).not.toContain("trashed");
  });

  it("today=未完成且 dueDate<=今天", () => {
    expect(run(todos, { view: "today" }).sort()).toEqual(["overdue", "today"]);
  });

  it("upcoming=未来有截止日期的未完成", () => {
    expect(run(todos, { view: "upcoming" })).toEqual(["future"]);
  });

  it("completed/all 划分", () => {
    expect(run(todos, { view: "completed" })).toEqual(["done"]);
    expect(run(todos, { view: "all" })).toContain("done");
  });
});

describe("搜索与筛选", () => {
  const todos = [
    todo({ id: "a", title: "买牛奶", body: "```code 秘密```", tags: ["生活"] }),
    todo({ id: "b", title: "写代码", body: "正文", tags: ["工作"] }),
  ];

  it("搜索覆盖标题/正文代码块/标签，大小写不敏感", () => {
    expect(run(todos, { view: "inbox", search: "牛奶" })).toEqual(["a"]);
    expect(run(todos, { view: "inbox", search: "秘密" })).toEqual(["a"]);
    expect(run(todos, { view: "inbox", search: "工作" })).toEqual(["b"]);
  });

  it("标签 and/or/exclude，默认 and", () => {
    expect(run(todos, { view: "inbox", tags: ["生活", "工作"] })).toEqual([]);
    expect(run(todos, { view: "inbox", tags: ["生活", "工作"], tagMode: "or" }).sort()).toEqual([
      "a",
      "b",
    ]);
    expect(run(todos, { view: "inbox", tags: ["工作"], tagMode: "exclude" })).toEqual(["a"]);
  });

  it("目录筛选含子孙，未分类取并集", () => {
    const items = [
      todo({ id: "in-child", categoryId: "c2" }),
      todo({ id: "in-parent", categoryId: "c1" }),
      todo({ id: "none" }),
    ];
    expect(run(items, { view: "inbox", categoryIds: ["c1"] }).sort()).toEqual([
      "in-child",
      "in-parent",
    ]);
    expect(run(items, { view: "inbox", categoryIds: ["c2"], uncategorized: true }).sort()).toEqual([
      "in-child",
      "none",
    ]);
  });

  it("dueDate 筛选与优先级并集", () => {
    const items = [
      todo({ id: "od", dueDate: "2026-09-01", priority: 3 }),
      todo({ id: "t", dueDate: TODAY, priority: 1 }),
      todo({ id: "nd", priority: 3 }),
    ];
    expect(run(items, { view: "inbox", dueDate: "overdue" })).toEqual(["od"]);
    expect(run(items, { view: "inbox", dueDate: "none" })).toEqual(["nd"]);
    expect(run(items, { view: "inbox", priorities: [3] }).sort()).toEqual(["nd", "od"]);
  });
});

describe("排序", () => {
  it("默认排序：未完成→过期→优先级降→截止升→更新降", () => {
    const todos = [
      todo({ id: "done", status: "completed", priority: 3, updatedAt: "2026-09-19T00:00:00Z" }),
      todo({
        id: "low-old",
        priority: 1,
        dueDate: "2026-09-18",
        updatedAt: "2026-09-01T00:00:00Z",
      }),
      todo({
        id: "high-old",
        priority: 3,
        dueDate: "2026-09-18",
        updatedAt: "2026-09-01T00:00:00Z",
      }),
      todo({ id: "nodate", priority: 3, updatedAt: "2026-09-19T00:00:00Z" }),
    ];
    expect(run(todos, { view: "all" })).toEqual(["high-old", "low-old", "nodate", "done"]);
  });

  it("显式排序标题升序，无日期永远最后", () => {
    const todos = [
      todo({ id: "b", title: "乙", dueDate: "2026-09-20" }),
      todo({ id: "a", title: "甲" }),
    ];
    expect(run(todos, { view: "inbox", sort: ["title", "asc"] })).toEqual(["a", "b"]);
    expect(run(todos, { view: "inbox", sort: ["dueDate", "asc"] }).map((id) => id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("自定义顺序仅默认+无筛选时叠加，其余默认追加", () => {
    const todos = [todo({ id: "x" }), todo({ id: "y" }), todo({ id: "z" })];
    const customOrder = { inbox: ["z", "x"], all: [] };
    expect(run(todos, { view: "inbox" }, { customOrder })).toEqual(["z", "x", "y"]);
    // 显式排序或筛选中禁用
    expect(run(todos, { view: "inbox", sort: ["title", "asc"] }, { customOrder })[0]).toBe("x");
    expect(run(todos, { view: "inbox", search: "x" }, { customOrder })).toEqual(["x"]);
    expect(hasActiveFilter({ view: "inbox", search: "x" })).toBe(true);
    expect(hasActiveFilter({ view: "inbox" })).toBe(false);
  });
});

describe("计数与分组", () => {
  const todos = [
    todo({ id: "od", dueDate: "2026-09-01" }),
    todo({ id: "t", dueDate: TODAY }),
    todo({ id: "f", dueDate: "2026-09-25" }),
    todo({ id: "d", status: "completed", completedAt: "2026-09-18T10:00:00Z" }),
  ];

  it("视图计数", () => {
    expect(viewCounts(todos, TODAY)).toEqual({
      inbox: 3,
      today: 2,
      upcoming: 1,
      completed: 1,
      all: 4,
    });
  });

  it("今日按过期/今天分组", () => {
    const groups = groupToday(runQuery({ view: "today" }, ctx(todos)), TODAY);
    expect(groups.map((group) => group.key)).toEqual(["expired", "today"]);
  });

  it("即将到期按时间段分组", () => {
    // 09-25 距 09-19 为 6 天，落入“未来 7 天”。
    const groups = groupUpcoming(runQuery({ view: "upcoming" }, ctx(todos)), TODAY);
    expect(groups.map((group) => group.key)).toEqual(["week"]);
  });

  it("已完成按完成日期分组", () => {
    const groups = groupCompleted(runQuery({ view: "completed" }, ctx(todos)));
    expect(groups[0].key).toBe("2026-09-18");
  });
});

describe("目录展开", () => {
  it("含子孙、跳过已删除", () => {
    const deleted: Category = { ...CATS[1], id: "c3", deletedAt: "2026-09-01T00:00:00Z" };
    expect(expandCategoryIds(["c1"], [...CATS, deleted])).toEqual(new Set(["c1", "c2"]));
  });
});
