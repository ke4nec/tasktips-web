import type { CustomOrder } from "@/domain/query";
import type { Category, CreateTodoInput, Tag, Todo, TodoPatch, TrashItem } from "@/domain/types";

export interface CreateCategoryInput {
  name: string;
  parentId: string | null;
  color?: string;
}

export interface CreateTagInput {
  name: string;
  group?: string;
  color?: string;
}

export interface TrashSnapshot {
  todos: TrashItem[];
  categories: TrashItem[];
  tags: TrashItem[];
  retentionDays: number;
}

export interface CategoryDeleteImpact {
  categories: number;
  todos: number;
}

export interface CategoryRestoreResult {
  restoredTodos: number;
  conflicts: string[];
}

// 内容仓储抽象：P3 由内存 Mock 实现；P5 替换为 Dexie（IndexedDB）实现，
// P6 在其上叠加同步引擎。业务 store 只依赖此接口。
export interface ContentPort {
  listTodos(projectId: string): Promise<Todo[]>;
  createTodo(projectId: string, input: CreateTodoInput): Promise<Todo>;
  updateTodo(projectId: string, id: string, patch: TodoPatch): Promise<Todo>;
  setCompleted(projectId: string, id: string, completed: boolean): Promise<Todo>;
  deleteTodo(projectId: string, id: string): Promise<void>;
  restoreTodo(projectId: string, id: string): Promise<void>;
  purgeTodo(projectId: string, id: string): Promise<void>;

  listCategories(projectId: string): Promise<Category[]>;
  createCategory(projectId: string, input: CreateCategoryInput): Promise<Category>;
  renameCategory(
    projectId: string,
    id: string,
    input: { name: string; color?: string },
  ): Promise<Category>;
  moveCategory(projectId: string, id: string, parentId: string | null): Promise<Category>;
  deleteCategory(projectId: string, id: string): Promise<CategoryDeleteImpact>;
  restoreCategory(projectId: string, id: string): Promise<CategoryRestoreResult>;
  purgeCategory(projectId: string, id: string): Promise<void>;

  listTags(projectId: string): Promise<Tag[]>;
  createTag(projectId: string, input: CreateTagInput): Promise<Tag>;
  renameTag(projectId: string, id: string, name: string): Promise<Tag>;
  setTagGroup(projectId: string, id: string, group: string): Promise<Tag>;
  deleteTagGroup(projectId: string, group: string): Promise<void>;
  deleteTag(projectId: string, id: string): Promise<void>;
  restoreTag(projectId: string, id: string): Promise<void>;
  purgeTag(projectId: string, id: string): Promise<void>;

  listTrash(projectId: string): Promise<TrashSnapshot>;
  emptyTrash(projectId: string): Promise<void>;

  getCustomOrder(projectId: string): Promise<CustomOrder>;
  setCustomOrder(projectId: string, view: "inbox" | "all", ids: string[]): Promise<void>;
}
