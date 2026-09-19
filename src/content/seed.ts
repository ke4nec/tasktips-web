import { deriveTitle } from "@/domain/title";
import { todayLocal } from "@/domain/datetime";
import type { Category, CreateTodoInput, Tag, Todo, TodoPriority } from "@/domain/types";

export interface SeedState {
  todos: Todo[];
  categories: Category[];
  tags: Tag[];
  customOrder: { inbox: string[]; all: string[] };
  seq: number;
}

const DAY = 86_400_000;

function shift(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function stamp(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString();
}

function makeTodo(
  seq: { value: number },
  partial: Partial<Todo> & { body: string; dueDate?: string; categoryId?: string },
): Todo {
  const id = `t-seed-${++seq.value}`;
  const createdAt = stamp(6);
  return {
    title: deriveTitle(partial.body) || "未命名 Todo",
    status: "open",
    priority: 0,
    tags: [],
    createdAt,
    updatedAt: stamp(1),
    revision: 1,
    seeded: true,
    ...partial,
    id,
  };
}

// 演示种子：相对今天构造，覆盖过期/今天/未来/无日期/已完成/回收站/未分类。
// 仅 demo 项目懒加载；新建项目从空内容开始。
export function seedProject(): SeedState {
  const seq = { value: 0 };
  const today = todayLocal();
  const categories: Category[] = [
    {
      id: "c-seed-design",
      name: "产品设计",
      parentId: null,
      color: "#4a9eff",
      icon: "",
      description: "",
      orderIndex: 0,
      createdAt: stamp(20),
      updatedAt: stamp(20),
      seeded: true,
    },
    {
      id: "c-seed-life",
      name: "个人生活",
      parentId: null,
      color: "#6ccb5f",
      icon: "",
      description: "",
      orderIndex: 1,
      createdAt: stamp(20),
      updatedAt: stamp(20),
      seeded: true,
    },
    {
      id: "c-seed-reading",
      name: "阅读清单",
      parentId: "c-seed-life",
      color: "#a78bfa",
      icon: "",
      description: "",
      orderIndex: 0,
      createdAt: stamp(19),
      updatedAt: stamp(19),
      seeded: true,
    },
  ];
  const tags: Tag[] = [
    {
      id: "tag-seed-work",
      name: "工作",
      color: "#4a9eff",
      icon: "",
      description: "",
      isSystem: false,
      group: "属性",
      createdAt: stamp(20),
      updatedAt: stamp(20),
      seeded: true,
    },
    {
      id: "tag-seed-life",
      name: "生活",
      color: "#6ccb5f",
      icon: "",
      description: "",
      isSystem: false,
      group: "",
      createdAt: stamp(20),
      updatedAt: stamp(20),
      seeded: true,
    },
    {
      id: "tag-seed-idea",
      name: "灵感",
      color: "#e05299",
      icon: "",
      description: "",
      isSystem: false,
      group: "",
      createdAt: stamp(15),
      updatedAt: stamp(15),
      seeded: true,
    },
  ];
  const todos: Todo[] = [
    makeTodo(seq, {
      body: "# 核对多端同步的交互细节\n\n离线状态、冲突处理与自动保存。",
      dueDate: shift(today, -1),
      priority: 3 as TodoPriority,
      tags: ["工作"],
      categoryId: "c-seed-design",
    }),
    makeTodo(seq, {
      body: "# 完善 TaskTips Web 设计稿\n\n- [ ] 确定页面结构与导航\n- [x] 整理浅色与深色主题\n\n```ts\nconst demo = true;\n```",
      dueDate: today,
      priority: 2 as TodoPriority,
      tags: ["工作"],
      categoryId: "c-seed-design",
    }),
    makeTodo(seq, {
      body: "# 准备产品演示\n\n从一条任务讲起。",
      dueDate: shift(today, 3),
      priority: 1 as TodoPriority,
      tags: [],
      categoryId: "c-seed-design",
    }),
    makeTodo(seq, {
      body: "# 读完《设计中的设计》第二章\n\n留一点时间给新的视角。",
      tags: ["灵感"],
      categoryId: "c-seed-reading",
    }),
    makeTodo(seq, {
      body: "# 傍晚散步 30 分钟\n\n放下屏幕，看看今天的天空。",
      tags: ["生活"],
    }),
    {
      ...makeTodo(seq, { body: "# 整理上周产品评审记录\n\n把讨论变成清晰的下一步。" }),
      status: "completed",
      completedAt: stamp(0),
      updatedAt: stamp(0),
    },
    {
      ...makeTodo(seq, { body: "# 旧的草稿\n\n删除后进入回收站。" }),
      deletedAt: stamp(2),
    },
  ];
  return { todos, categories, tags, customOrder: { inbox: [], all: [] }, seq: seq.value };
}

export function emptyProject(): SeedState {
  return { todos: [], categories: [], tags: [], customOrder: { inbox: [], all: [] }, seq: 0 };
}

export type { CreateTodoInput };
