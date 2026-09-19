import { isOverdue } from "./datetime";
import type {
  Category,
  SortDirection,
  SortKey,
  Todo,
  TodoQuery,
  TodoView,
  ViewCounts,
} from "./types";

export interface CustomOrder {
  inbox: string[];
  all: string[];
}

export interface QueryContext {
  todos: Todo[];
  categories: Category[];
  today: string;
  customOrder: CustomOrder;
}

// 目录筛选展开：选中目录含整棵有效子树（已删除目录除外）。
export function expandCategoryIds(categoryIds: string[], categories: Category[]): Set<string> {
  const childrenOf = new Map<string | null, Category[]>();
  for (const category of categories) {
    if (category.deletedAt) continue;
    const list = childrenOf.get(category.parentId) ?? [];
    list.push(category);
    childrenOf.set(category.parentId, list);
  }
  const result = new Set<string>();
  const stack = [...categoryIds];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child.id);
  }
  return result;
}

function defaultStatus(view: TodoView): "open" | "completed" | "any" {
  if (view === "completed") return "completed";
  if (view === "all") return "any";
  return "open";
}

function matchView(todo: Todo, view: TodoView, today: string): boolean {
  if (todo.deletedAt) return false;
  switch (view) {
    case "inbox":
      return todo.status === "open";
    case "today":
      return todo.status === "open" && !!todo.dueDate && todo.dueDate <= today;
    case "upcoming":
      return todo.status === "open" && !!todo.dueDate && todo.dueDate > today;
    case "completed":
      return todo.status === "completed";
    case "all":
      return true;
  }
}

function matchSearch(todo: Todo, term: string): boolean {
  // 覆盖标题、正文（含代码块原文）与标签，大小写不敏感（§4.1）。
  const haystack = `${todo.title}\n${todo.body}\n${todo.tags.join("\n")}`.toLowerCase();
  return haystack.includes(term);
}

function matchTags(todo: Todo, tags: string[], mode: "and" | "or" | "exclude"): boolean {
  if (tags.length === 0) return true;
  const owned = new Set(todo.tags.map((tag) => tag.toLowerCase()));
  const wanted = tags.map((tag) => tag.toLowerCase());
  if (mode === "or") return wanted.some((tag) => owned.has(tag));
  if (mode === "exclude") return wanted.every((tag) => !owned.has(tag));
  return wanted.every((tag) => owned.has(tag));
}

type Comparable = string | number;

function compareValues(a: Comparable | undefined, b: Comparable | undefined): number {
  // 缺失值永远排最后，与升降序无关。
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function explicitCompare(a: Todo, b: Todo, key: SortKey, direction: SortDirection): number {
  const mul = direction === "asc" ? 1 : -1;
  let result: number;
  switch (key) {
    case "title":
      result = a.title.localeCompare(b.title, "zh");
      break;
    case "priority":
      result = a.priority - b.priority;
      break;
    case "dueDate":
      result = compareValues(a.dueDate, b.dueDate);
      break;
    case "createdAt":
      result = compareValues(a.createdAt, b.createdAt);
      break;
    case "updatedAt":
    default:
      result = compareValues(a.updatedAt, b.updatedAt);
      break;
  }
  if (result !== 0) return result * mul;
  return a.id < b.id ? -1 : 1;
}

// 默认排序：未完成 → 过期 → 优先级降序 → 截止升序（无日期最后）→ 更新降序（§4.1）。
function defaultCompare(a: Todo, b: Todo, today: string): number {
  const statusOrder = (todo: Todo) => (todo.status === "open" ? 0 : 1);
  if (statusOrder(a) !== statusOrder(b)) return statusOrder(a) - statusOrder(b);
  const overdueOrder = (todo: Todo) =>
    todo.status === "open" && todo.dueDate && isOverdue(todo.dueDate, today) ? 0 : 1;
  if (overdueOrder(a) !== overdueOrder(b)) return overdueOrder(a) - overdueOrder(b);
  if (a.priority !== b.priority) return b.priority - a.priority;
  const due = compareValues(a.dueDate, b.dueDate);
  if (due !== 0) return due;
  const updated = compareValues(b.updatedAt, a.updatedAt);
  if (updated !== 0) return updated;
  return a.id < b.id ? -1 : 1;
}

export function hasActiveFilter(query: TodoQuery): boolean {
  if (query.search?.trim()) return true;
  if (query.tags?.length) return true;
  if (query.priorities?.length) return true;
  if (query.categoryIds?.length || query.uncategorized) return true;
  if (query.dueDate && query.dueDate !== "any") return true;
  if (query.status && query.status !== defaultStatus(query.view)) return true;
  return false;
}

export function runQuery(query: TodoQuery, ctx: QueryContext): Todo[] {
  const status = query.status ?? defaultStatus(query.view);
  const term = query.search?.trim().toLowerCase() ?? "";
  const tagMode = query.tagMode ?? "and";
  const expanded =
    query.categoryIds?.length || query.uncategorized
      ? expandCategoryIds(query.categoryIds ?? [], ctx.categories)
      : null;

  const filtered = ctx.todos.filter((todo) => {
    if (!matchView(todo, query.view, ctx.today)) return false;
    if (status === "open" && todo.status !== "open") return false;
    if (status === "completed" && todo.status !== "completed") return false;
    if (term && !matchSearch(todo, term)) return false;
    if (expanded) {
      const inTree = !!todo.categoryId && expanded.has(todo.categoryId);
      const isUncategorized = !todo.categoryId;
      if (!(inTree || (query.uncategorized && isUncategorized))) return false;
    }
    if (!matchTags(todo, query.tags ?? [], tagMode)) return false;
    if (query.priorities?.length && !query.priorities.includes(todo.priority)) return false;
    if (query.dueDate === "overdue" && !(todo.dueDate && isOverdue(todo.dueDate, ctx.today))) {
      return false;
    }
    if (query.dueDate === "today" && todo.dueDate !== ctx.today) return false;
    if (query.dueDate === "none" && todo.dueDate) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) =>
    query.sort
      ? explicitCompare(a, b, query.sort[0], query.sort[1])
      : defaultCompare(a, b, ctx.today),
  );

  // 自定义顺序：仅 inbox/all、默认排序、无筛选时叠加（§4.1）。
  if (!query.sort && !hasActiveFilter(query) && (query.view === "inbox" || query.view === "all")) {
    const order = ctx.customOrder[query.view];
    if (order.length > 0) {
      const position = new Map(order.map((id, index) => [id, index]));
      const pinned = sorted.filter((todo) => position.has(todo.id));
      const rest = sorted.filter((todo) => !position.has(todo.id));
      pinned.sort((a, b) => (position.get(a.id) as number) - (position.get(b.id) as number));
      return [...pinned, ...rest];
    }
  }
  return sorted;
}

// 侧栏视图计数：纯视图谓词，不过滤（§4.1 inbox=全部未完成）。
export function viewCounts(todos: Todo[], today: string): ViewCounts {
  const open = todos.filter((todo) => !todo.deletedAt && todo.status === "open");
  const completed = todos.filter((todo) => !todo.deletedAt && todo.status === "completed");
  return {
    inbox: open.length,
    today: open.filter((todo) => !!todo.dueDate && todo.dueDate <= today).length,
    upcoming: open.filter((todo) => !!todo.dueDate && todo.dueDate > today).length,
    completed: completed.length,
    all: open.length + completed.length,
  };
}

export interface TodoGroup {
  key: string;
  label: string;
  items: Todo[];
}

// 今日分组：过期 / 今天（§4.1）。
export function groupToday(todos: Todo[], today: string): TodoGroup[] {
  const expired = todos.filter((todo) => todo.dueDate && isOverdue(todo.dueDate, today));
  const current = todos.filter((todo) => !todo.dueDate || !isOverdue(todo.dueDate, today));
  return [
    { key: "expired", label: "已过期", items: expired },
    { key: "today", label: "今天", items: current },
  ].filter((group) => group.items.length > 0);
}

// 已完成分组：按完成日期倒序。
export function groupCompleted(todos: Todo[]): TodoGroup[] {
  const byDate = new Map<string, Todo[]>();
  for (const todo of todos) {
    const key = (todo.completedAt ?? todo.updatedAt).slice(0, 10);
    const list = byDate.get(key) ?? [];
    list.push(todo);
    byDate.set(key, list);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, items]) => ({ key, label: key, items }));
}

// 即将到期的未来时间段分组：明天 / 未来 7 天 / 更晚。
export function groupUpcoming(todos: Todo[], today: string): TodoGroup[] {
  const plus = (days: number) => {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() + days);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  };
  const tomorrow = plus(1);
  const weekLater = plus(7);
  const groups: TodoGroup[] = [
    { key: "tomorrow", label: "明天", items: [] },
    { key: "week", label: "未来 7 天", items: [] },
    { key: "later", label: "更晚", items: [] },
  ];
  for (const todo of todos) {
    if (!todo.dueDate) continue;
    if (todo.dueDate <= tomorrow) groups[0].items.push(todo);
    else if (todo.dueDate <= weekLater) groups[1].items.push(todo);
    else groups[2].items.push(todo);
  }
  return groups.filter((group) => group.items.length > 0);
}
