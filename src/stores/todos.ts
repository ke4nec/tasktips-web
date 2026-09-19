import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { content } from "@/content";
import { todayLocal } from "@/domain/datetime";
import { runQuery, viewCounts } from "@/domain/query";
import type {
  CreateTodoInput,
  DueDateFilter,
  StatusFilter,
  SortDirection,
  SortKey,
  TagFilterMode,
  Todo,
  TodoPriority,
  TodoQuery,
  TodoView,
} from "@/domain/types";
import { useClassificationStore } from "@/stores/classification";
import { useUiStore } from "@/stores/ui";

// 任务工作台 store：查询状态、默认/显式/自定义排序、完成与删除。
// 查询语义见 domain/query（设计文档 §4.1），持久化与同步在 P5/P6 接入。
export const useTodoStore = defineStore("todos", () => {
  const projectId = ref("");
  const todos = ref<Todo[]>([]);
  const customOrder = ref<{ inbox: string[]; all: string[] }>({ inbox: [], all: [] });

  // 筛选状态（自由文本搜索保留在本地会话，不写入 URL §3.1）。
  const search = ref("");
  const tags = ref<string[]>([]);
  const tagMode = ref<TagFilterMode>("and");
  const priorities = ref<TodoPriority[]>([]);
  const categoryIds = ref<string[]>([]);
  const uncategorized = ref(false);
  const dueDate = ref<DueDateFilter>("any");
  const status = ref<StatusFilter>("any");
  const sort = ref<[SortKey, SortDirection] | undefined>(undefined);

  const counts = computed(() => viewCounts(todos.value, todayLocal()));

  function currentQuery(view: TodoView): TodoQuery {
    return {
      view,
      search: search.value,
      tags: tags.value,
      tagMode: tagMode.value,
      priorities: priorities.value,
      categoryIds: categoryIds.value,
      uncategorized: uncategorized.value,
      dueDate: dueDate.value,
      status: status.value,
      sort: sort.value,
    };
  }

  function results(view: TodoView): Todo[] {
    const classification = useClassificationStore();
    return runQuery(currentQuery(view), {
      todos: todos.value,
      categories: classification.categories,
      today: todayLocal(),
      customOrder: customOrder.value,
    });
  }

  function filterCount(): number {
    let count = 0;
    if (search.value.trim()) count += 1;
    if (tags.value.length) count += 1;
    if (priorities.value.length) count += 1;
    if (categoryIds.value.length || uncategorized.value) count += 1;
    if (dueDate.value !== "any") count += 1;
    if (status.value !== "any") count += 1;
    return count;
  }

  async function load(id: string) {
    projectId.value = id;
    todos.value = await content.listTodos(id);
    customOrder.value = await content.getCustomOrder(id);
  }

  async function reload() {
    if (!projectId.value) return;
    await load(projectId.value);
  }

  async function create(input: CreateTodoInput): Promise<Todo> {
    const todo = await content.createTodo(projectId.value, input);
    await reload();
    return todo;
  }

  async function toggleCompleted(id: string) {
    const todo = todos.value.find((item) => item.id === id);
    if (!todo) return;
    const completed = todo.status !== "completed";
    await content.setCompleted(projectId.value, id, completed);
    await reload();
    useUiStore().notify(completed ? "又完成了一件小事。" : "任务已重新打开");
  }

  async function remove(id: string) {
    await content.deleteTodo(projectId.value, id);
    await reload();
    useUiStore().notify("已移入回收站");
  }

  async function reorder(view: "inbox" | "all", ids: string[]) {
    // 写回保留已有软删除 ID 由仓储层合并（§4.1）。
    await content.setCustomOrder(projectId.value, view, ids);
    customOrder.value = await content.getCustomOrder(projectId.value);
  }

  function setSearch(value: string) {
    search.value = value.trim();
  }

  function setSort(key: SortKey | "default", direction: SortDirection = "asc") {
    sort.value = key === "default" ? undefined : [key, direction];
  }

  // 清除筛选同时清除搜索并恢复默认排序（§4.1）。
  function clearFilters() {
    search.value = "";
    tags.value = [];
    tagMode.value = "and";
    priorities.value = [];
    categoryIds.value = [];
    uncategorized.value = false;
    dueDate.value = "any";
    status.value = "any";
    sort.value = undefined;
  }

  function toggleTagFilter(tag: string) {
    const wanted = tag.toLowerCase();
    tags.value = tags.value.some((item) => item.toLowerCase() === wanted)
      ? tags.value.filter((item) => item.toLowerCase() !== wanted)
      : [...tags.value, tag];
  }

  function togglePriorityFilter(priority: TodoPriority) {
    priorities.value = priorities.value.includes(priority)
      ? priorities.value.filter((item) => item !== priority)
      : [...priorities.value, priority];
  }

  function setCategoryFilter(ids: string[], includeUncategorized = false) {
    categoryIds.value = ids;
    uncategorized.value = includeUncategorized;
  }

  return {
    todos,
    customOrder,
    search,
    tags,
    tagMode,
    priorities,
    categoryIds,
    uncategorized,
    dueDate,
    status,
    sort,
    counts,
    currentQuery,
    results,
    filterCount,
    load,
    reload,
    create,
    toggleCompleted,
    remove,
    reorder,
    setSearch,
    setSort,
    clearFilters,
    toggleTagFilter,
    togglePriorityFilter,
    setCategoryFilter,
  };
});
