import {
  categoryNameIssue,
  depthOf,
  isTrashExpired,
  moveCategoryIssue,
  siblingNameTaken,
  tagNameIssue,
  tagNameTaken,
} from "@/domain/classification";
import { isPaletteColor } from "@/domain/colors";
import type { CustomOrder } from "@/domain/query";
import { deriveTitle } from "@/domain/title";
import type { Category, CreateTodoInput, Tag, Todo, TodoPatch, TrashItem } from "@/domain/types";
import { ApiError } from "@/api/types";
import type {
  CategoryDeleteImpact,
  CategoryRestoreResult,
  ContentPort,
  CreateCategoryInput,
  CreateTagInput,
  TrashSnapshot,
} from "./port";
import { emptyProject, seedProject, type SeedState } from "./seed";

interface CategoryBatch {
  deletedAt: string;
  categoryIds: string[];
  todoIds: string[];
}

interface ProjectState extends SeedState {
  batches: CategoryBatch[];
}

// 内存内容仓储：实现 §4 全部业务规则，供工作台 UI 先行。
// P5 替换为 Dexie 实现（事务、原始字节、恢复副本），接口保持不变。
export class MockContent implements ContentPort {
  private projects = new Map<string, ProjectState>();

  private stateOf(projectId: string): ProjectState {
    let state = this.projects.get(projectId);
    if (!state) {
      const seed = projectId === "demo" ? seedProject() : emptyProject();
      state = { ...seed, batches: [] };
      this.projects.set(projectId, state);
    }
    return state;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private nextId(state: ProjectState, prefix: string): string {
    state.seq += 1;
    return `${prefix}-${state.seq}`;
  }

  private sweep(state: ProjectState) {
    // 到期清理：应用运行中触发，不承诺关闭时按时清理（§4.2）。
    state.todos = state.todos.filter((todo) => !(todo.deletedAt && isTrashExpired(todo.deletedAt)));
    state.categories = state.categories.filter(
      (category) => !(category.deletedAt && isTrashExpired(category.deletedAt)),
    );
    state.tags = state.tags.filter((tag) => !(tag.deletedAt && isTrashExpired(tag.deletedAt)));
  }

  private categoryPath(state: ProjectState, categoryId: string | undefined): string[] {
    const path: string[] = [];
    let current = state.categories.find((item) => item.id === categoryId);
    while (current) {
      path.unshift(current.name);
      current = state.categories.find((item) => item.id === current?.parentId);
    }
    return path;
  }

  // ---- 任务 ----

  async listTodos(projectId: string): Promise<Todo[]> {
    const state = this.stateOf(projectId);
    this.sweep(state);
    return state.todos.map((todo) => ({ ...todo, tags: [...todo.tags] }));
  }

  async createTodo(projectId: string, input: CreateTodoInput): Promise<Todo> {
    const state = this.stateOf(projectId);
    const body = input.body ?? "";
    const createdAt = this.now();
    const todo: Todo = {
      id: this.nextId(state, "t"),
      title: deriveTitle(body) || "未命名 Todo",
      body,
      status: "open",
      priority: input.priority ?? 0,
      tags: [...(input.tags ?? [])],
      dueDate: input.dueDate,
      categoryId: input.categoryId,
      createdAt,
      updatedAt: createdAt,
      revision: 1,
    };
    state.todos.push(todo);
    return { ...todo };
  }

  async updateTodo(projectId: string, id: string, patch: TodoPatch): Promise<Todo> {
    const todo = this.findTodo(projectId, id);
    if (patch.body !== undefined) {
      todo.body = patch.body;
      todo.title = deriveTitle(patch.body) || "未命名 Todo";
    }
    if (patch.priority !== undefined) todo.priority = patch.priority;
    if (patch.tags !== undefined) todo.tags = [...patch.tags];
    if (patch.dueDate !== undefined) {
      if (patch.dueDate === null) delete todo.dueDate;
      else todo.dueDate = patch.dueDate;
    }
    if (patch.categoryId !== undefined) {
      if (patch.categoryId === null) delete todo.categoryId;
      else todo.categoryId = patch.categoryId;
    }
    todo.updatedAt = this.now();
    todo.revision += 1;
    return { ...todo, tags: [...todo.tags] };
  }

  async setCompleted(projectId: string, id: string, completed: boolean): Promise<Todo> {
    const todo = this.findTodo(projectId, id);
    // 完成设置 completedAt，取消完成清空它（§4.1）。
    todo.status = completed ? "completed" : "open";
    if (completed) todo.completedAt = this.now();
    else delete todo.completedAt;
    todo.updatedAt = this.now();
    todo.revision += 1;
    return { ...todo, tags: [...todo.tags] };
  }

  async deleteTodo(projectId: string, id: string): Promise<void> {
    const todo = this.findTodo(projectId, id);
    if (!todo.deletedAt) {
      todo.deletedAt = this.now();
      todo.updatedAt = todo.deletedAt;
      todo.revision += 1;
    }
  }

  async restoreTodo(projectId: string, id: string): Promise<void> {
    const todo = this.findTodo(projectId, id);
    // 恢复保持原 ID 和关联；缺失目录按未分类展示（§4.2，不在此处清 categoryId）。
    delete todo.deletedAt;
    todo.updatedAt = this.now();
    todo.revision += 1;
  }

  async purgeTodo(projectId: string, id: string): Promise<void> {
    const state = this.stateOf(projectId);
    state.todos = state.todos.filter((todo) => todo.id !== id);
    for (const key of ["inbox", "all"] as const) {
      state.customOrder[key] = state.customOrder[key].filter((todoId) => todoId !== id);
    }
  }

  private findTodo(projectId: string, id: string): Todo {
    const state = this.stateOf(projectId);
    const todo = state.todos.find((item) => item.id === id);
    if (!todo) throw new ApiError("NOT_FOUND", "任务不存在。", 404);
    return todo;
  }

  // ---- 目录 ----

  async listCategories(projectId: string): Promise<Category[]> {
    const state = this.stateOf(projectId);
    this.sweep(state);
    return state.categories.map((category) => ({ ...category }));
  }

  async createCategory(projectId: string, input: CreateCategoryInput): Promise<Category> {
    const state = this.stateOf(projectId);
    const issue = categoryNameIssue(input.name);
    if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
    if (siblingNameTaken(state.categories, input.parentId, input.name)) {
      throw new ApiError("VALIDATION_ERROR", "同级目录已存在同名目录。", 400);
    }
    if (input.parentId) {
      const parent = state.categories.find((item) => item.id === input.parentId);
      if (!parent || parent.deletedAt) throw new ApiError("NOT_FOUND", "父目录不存在。", 404);
      if (depthOf(state.categories, input.parentId) + 1 > 3) {
        throw new ApiError("VALIDATION_ERROR", "目录最多三级。", 400);
      }
    }
    const color = input.color ?? "#8a8a8a";
    if (!isPaletteColor(color)) throw new ApiError("VALIDATION_ERROR", "颜色不在预设色板中。", 400);
    const createdAt = this.now();
    const category: Category = {
      id: this.nextId(state, "c"),
      name: input.name.trim(),
      parentId: input.parentId,
      color,
      icon: "",
      description: "",
      orderIndex: state.categories.filter((item) => item.parentId === input.parentId).length,
      createdAt,
      updatedAt: createdAt,
    };
    state.categories.push(category);
    return { ...category };
  }

  async renameCategory(
    projectId: string,
    id: string,
    input: { name: string; color?: string },
  ): Promise<Category> {
    const state = this.stateOf(projectId);
    const category = this.findCategory(state, id);
    const issue = categoryNameIssue(input.name);
    if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
    if (siblingNameTaken(state.categories, category.parentId, input.name, id)) {
      throw new ApiError("VALIDATION_ERROR", "同级目录已存在同名目录。", 400);
    }
    category.name = input.name.trim();
    if (input.color !== undefined) {
      if (!isPaletteColor(input.color)) {
        throw new ApiError("VALIDATION_ERROR", "颜色不在预设色板中。", 400);
      }
      category.color = input.color;
    }
    category.updatedAt = this.now();
    return { ...category };
  }

  async moveCategory(projectId: string, id: string, parentId: string | null): Promise<Category> {
    const state = this.stateOf(projectId);
    const category = this.findCategory(state, id);
    if (parentId) {
      const parent = state.categories.find((item) => item.id === parentId);
      if (!parent || parent.deletedAt) throw new ApiError("NOT_FOUND", "目标目录不存在。", 404);
    }
    const issue = moveCategoryIssue(state.categories, id, parentId);
    if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
    if (siblingNameTaken(state.categories, parentId, category.name, id)) {
      throw new ApiError("VALIDATION_ERROR", "目标位置已存在同名目录。", 400);
    }
    category.parentId = parentId;
    category.updatedAt = this.now();
    return { ...category };
  }

  async deleteCategory(projectId: string, id: string): Promise<CategoryDeleteImpact> {
    const state = this.stateOf(projectId);
    const root = this.findCategory(state, id);
    if (root.deletedAt) return { categories: 0, todos: 0 };
    // 整棵有效子树及其中未删除任务使用同一删除时间标记（§4.2）。
    const deletedAt = this.now();
    const subtreeIds = [id, ...this.descendantIds(state, id)];
    let todos = 0;
    for (const categoryId of subtreeIds) {
      const category = state.categories.find((item) => item.id === categoryId);
      if (category && !category.deletedAt) {
        category.deletedAt = deletedAt;
        category.updatedAt = deletedAt;
      }
    }
    const batchTodoIds: string[] = [];
    for (const todo of state.todos) {
      if (todo.categoryId && subtreeIds.includes(todo.categoryId) && !todo.deletedAt) {
        todo.deletedAt = deletedAt;
        todo.updatedAt = deletedAt;
        todo.revision += 1;
        batchTodoIds.push(todo.id);
        todos += 1;
      }
    }
    state.batches.push({ deletedAt, categoryIds: subtreeIds, todoIds: batchTodoIds });
    return { categories: subtreeIds.length, todos };
  }

  async restoreCategory(projectId: string, id: string): Promise<CategoryRestoreResult> {
    const state = this.stateOf(projectId);
    const category = this.findCategory(state, id);
    if (!category.deletedAt) return { restoredTodos: 0, conflicts: [] };
    const batch = state.batches.find((item) => item.deletedAt === category.deletedAt);
    const conflicts: string[] = [];
    let restoredTodos = 0;
    const restoreOne = (categoryId: string) => {
      const item = state.categories.find((entry) => entry.id === categoryId);
      if (!item?.deletedAt) return;
      // 同名冲突保留回收站条目并提示处理，不覆盖现存分类（§4.2）。
      if (siblingNameTaken(state.categories, item.parentId, item.name, item.id)) {
        conflicts.push(item.name);
        return;
      }
      delete item.deletedAt;
      item.updatedAt = this.now();
    };
    if (batch) {
      for (const categoryId of batch.categoryIds) restoreOne(categoryId);
      // 只恢复同批内容，不复活此前单独删除的任务（§4.2）。
      for (const todoId of batch.todoIds) {
        const todo = state.todos.find((entry) => entry.id === todoId);
        if (todo?.deletedAt === batch.deletedAt) {
          delete todo.deletedAt;
          todo.updatedAt = this.now();
          todo.revision += 1;
          restoredTodos += 1;
        }
      }
    } else {
      restoreOne(id);
    }
    return { restoredTodos, conflicts };
  }

  async purgeCategory(projectId: string, id: string): Promise<void> {
    const state = this.stateOf(projectId);
    const subtreeIds = [id, ...this.descendantIds(state, id)];
    const removedTodoIds = new Set(
      state.todos
        .filter((todo) => todo.categoryId && subtreeIds.includes(todo.categoryId))
        .map((todo) => todo.id),
    );
    state.categories = state.categories.filter((category) => !subtreeIds.includes(category.id));
    state.todos = state.todos.filter((todo) => !removedTodoIds.has(todo.id));
    for (const key of ["inbox", "all"] as const) {
      state.customOrder[key] = state.customOrder[key].filter(
        (todoId) => !removedTodoIds.has(todoId),
      );
    }
  }

  private findCategory(state: SeedState, id: string): Category {
    const category = state.categories.find((item) => item.id === id);
    if (!category) throw new ApiError("NOT_FOUND", "目录不存在。", 404);
    return category;
  }

  private descendantIds(state: SeedState, rootId: string): string[] {
    const result: string[] = [];
    const stack = state.categories
      .filter((item) => item.parentId === rootId && !item.deletedAt)
      .map((item) => item.id);
    while (stack.length > 0) {
      const id = stack.pop() as string;
      result.push(id);
      for (const child of state.categories.filter(
        (item) => item.parentId === id && !item.deletedAt,
      )) {
        stack.push(child.id);
      }
    }
    return result;
  }

  // ---- 标签 ----

  async listTags(projectId: string): Promise<Tag[]> {
    const state = this.stateOf(projectId);
    this.sweep(state);
    return state.tags.map((tag) => ({ ...tag }));
  }

  async createTag(projectId: string, input: CreateTagInput): Promise<Tag> {
    const state = this.stateOf(projectId);
    const issue = tagNameIssue(input.name);
    if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
    if (tagNameTaken(state.tags, input.name)) {
      throw new ApiError("VALIDATION_ERROR", "标签名称已存在。", 400);
    }
    const color = input.color ?? "#8a8a8a";
    if (!isPaletteColor(color)) throw new ApiError("VALIDATION_ERROR", "颜色不在预设色板中。", 400);
    const createdAt = this.now();
    const tag: Tag = {
      id: this.nextId(state, "tag"),
      name: input.name.trim(),
      color,
      icon: "",
      description: "",
      isSystem: false,
      group: input.group?.trim() ?? "",
      createdAt,
      updatedAt: createdAt,
    };
    state.tags.push(tag);
    return { ...tag };
  }

  async renameTag(projectId: string, id: string, name: string): Promise<Tag> {
    const state = this.stateOf(projectId);
    const tag = this.findTag(state, id);
    const issue = tagNameIssue(name);
    if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
    if (tagNameTaken(state.tags, name, id)) {
      throw new ApiError("VALIDATION_ERROR", "标签名称已存在。", 400);
    }
    const previous = tag.name;
    tag.name = name.trim();
    tag.updatedAt = this.now();
    // 重命名更新全部相关任务，包括回收站任务（§4.2）。
    const wanted = previous.toLowerCase();
    for (const todo of state.todos) {
      todo.tags = todo.tags.map((tagName) =>
        tagName.toLowerCase() === wanted ? tag.name : tagName,
      );
    }
    return { ...tag };
  }

  async setTagGroup(projectId: string, id: string, group: string): Promise<Tag> {
    const state = this.stateOf(projectId);
    const tag = this.findTag(state, id);
    tag.group = group.trim();
    tag.updatedAt = this.now();
    return { ...tag };
  }

  async deleteTagGroup(projectId: string, group: string): Promise<void> {
    const state = this.stateOf(projectId);
    // 删除分组只把标签移入“其他”（§4.2：空组归“其他”，此处清空 group 字段）。
    for (const tag of state.tags) {
      if (!tag.deletedAt && tag.group === group) {
        tag.group = "";
        tag.updatedAt = this.now();
      }
    }
  }

  async deleteTag(projectId: string, id: string): Promise<void> {
    const state = this.stateOf(projectId);
    const tag = this.findTag(state, id);
    if (tag.isSystem) throw new ApiError("VALIDATION_ERROR", "系统标签不可删除。", 400);
    // 软删除保留任务引用（§4.2）。
    if (!tag.deletedAt) {
      tag.deletedAt = this.now();
      tag.updatedAt = tag.deletedAt;
    }
  }

  async restoreTag(projectId: string, id: string): Promise<void> {
    const state = this.stateOf(projectId);
    const tag = this.findTag(state, id);
    if (!tag.deletedAt) return;
    if (tagNameTaken(state.tags, tag.name, id)) {
      throw new ApiError("VALIDATION_ERROR", "已存在同名标签，请先处理冲突。", 409);
    }
    delete tag.deletedAt;
    tag.updatedAt = this.now();
  }

  async purgeTag(projectId: string, id: string): Promise<void> {
    const state = this.stateOf(projectId);
    const tag = this.findTag(state, id);
    // 彻底删除才移除全部任务引用（§4.2）。
    const wanted = tag.name.toLowerCase();
    for (const todo of state.todos) {
      todo.tags = todo.tags.filter((tagName) => tagName.toLowerCase() !== wanted);
    }
    state.tags = state.tags.filter((item) => item.id !== id);
  }

  private findTag(state: SeedState, id: string): Tag {
    const tag = state.tags.find((item) => item.id === id);
    if (!tag) throw new ApiError("NOT_FOUND", "标签不存在。", 404);
    return tag;
  }

  // ---- 回收站 / 排序 ----

  async listTrash(projectId: string): Promise<TrashSnapshot> {
    const state = this.stateOf(projectId);
    this.sweep(state);
    const todos: TrashItem[] = state.todos
      .filter((todo) => todo.deletedAt)
      .map((todo) => ({
        id: todo.id,
        name: todo.title,
        deletedAt: todo.deletedAt as string,
        categoryPath: this.categoryPath(state, todo.categoryId),
        tags: [...todo.tags],
      }));
    const categories: TrashItem[] = state.categories
      .filter((category) => category.deletedAt)
      .map((category) => ({
        id: category.id,
        name: category.name,
        deletedAt: category.deletedAt as string,
        subCategoryCount: state.categories.filter(
          (item) => item.parentId === category.id && item.deletedAt,
        ).length,
        trashedTodoCount: state.todos.filter(
          (todo) => todo.categoryId === category.id && todo.deletedAt,
        ).length,
      }));
    const tags: TrashItem[] = state.tags
      .filter((tag) => tag.deletedAt)
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        deletedAt: tag.deletedAt as string,
        usageCount: state.todos.filter((todo) =>
          todo.tags.some((tagName) => tagName.toLowerCase() === tag.name.toLowerCase()),
        ).length,
      }));
    return { todos, categories, tags, retentionDays: 30 };
  }

  async emptyTrash(projectId: string): Promise<void> {
    const state = this.stateOf(projectId);
    const removedTodoIds = new Set(
      state.todos.filter((todo) => todo.deletedAt).map((todo) => todo.id),
    );
    state.todos = state.todos.filter((todo) => !todo.deletedAt);
    state.categories = state.categories.filter((category) => !category.deletedAt);
    state.tags = state.tags.filter((tag) => !tag.deletedAt);
    state.batches = [];
    for (const key of ["inbox", "all"] as const) {
      state.customOrder[key] = state.customOrder[key].filter(
        (todoId) => !removedTodoIds.has(todoId),
      );
    }
  }

  async getCustomOrder(projectId: string): Promise<CustomOrder> {
    const state = this.stateOf(projectId);
    return { inbox: [...state.customOrder.inbox], all: [...state.customOrder.all] };
  }

  async setCustomOrder(projectId: string, view: "inbox" | "all", ids: string[]): Promise<void> {
    const state = this.stateOf(projectId);
    // 写回保留已有软删除 ID，不把筛选结果覆盖成全量顺序（§4.1）。
    const deletedIds = new Set(state.todos.filter((todo) => todo.deletedAt).map((todo) => todo.id));
    const merged = [...ids];
    for (const id of state.customOrder[view]) {
      if (!merged.includes(id) && deletedIds.has(id)) merged.push(id);
    }
    state.customOrder[view] = merged;
  }
}

// 共享单例：同浏览器会话内多 store 共用一份内存内容。
// P5 由 Dexie 实现替换，store 层无需改动。
export const content: ContentPort = new MockContent();
