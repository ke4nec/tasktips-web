import Dexie, { type Table } from "dexie";

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
import type { Category, CreateTodoInput, Tag, Todo, TodoPatch } from "@/domain/types";
import { ApiError } from "@/api/types";
import { storeImageBlob } from "@/editor/images";
import type {
  CategoryDeleteImpact,
  CategoryRestoreResult,
  ContentImage,
  ContentPort,
  ContentSnapshot,
  CreateCategoryInput,
  CreateTagInput,
  RecoveryCopy,
  TrashSnapshot,
} from "./port";
import { emptyProject, seedProject } from "./seed";

interface MetaRow {
  scope: string;
  seededAt: string;
  seq: number;
}

interface ScopedRow {
  key: string;
  scope: string;
}

interface TodoRow extends Todo, ScopedRow {}
interface CategoryRow extends Category, ScopedRow {}
interface TagRow extends Tag, ScopedRow {}

interface BatchRow {
  key: string;
  scope: string;
  deletedAt: string;
  categoryIds: string[];
  todoIds: string[];
}

interface CustomOrderRow {
  scope: string;
  inbox: string[];
  all: string[];
}

interface ImageRow {
  key: string;
  scope: string;
  path: string;
  blob: Blob;
  createdAt: string;
}

interface RecoveryRow {
  id: string;
  scope: string;
  label: string;
  createdAt: string;
  snapshot: ContentSnapshot;
}

const MAX_RECOVERIES = 10;

// Dexie 内容仓储（设计文档 §7）：userId+projectId 命名空间隔离，
// 多对象变更以显式读写事务更新本地状态；数据库升级走版本迁移。
export class DexieContent implements ContentPort {
  readonly db: Dexie;
  private meta!: Table<MetaRow, string>;
  private todos!: Table<TodoRow, string>;
  private categories!: Table<CategoryRow, string>;
  private tags!: Table<TagRow, string>;
  private batches!: Table<BatchRow, string>;
  private customOrders!: Table<CustomOrderRow, string>;
  private images!: Table<ImageRow, string>;
  private recoveries!: Table<RecoveryRow, string>;

  constructor(
    private readonly getUser: () => string,
    dbName = "tasktips-web",
  ) {
    const db = new Dexie(dbName);
    // v1：任务/分类/标签/墓碑批次/排序/图片/恢复副本/元信息。
    // P6 以 v2 追加同步状态（generation/cursor/基线/待提交），走显式迁移。
    db.version(1).stores({
      meta: "scope",
      todos: "key, scope, updatedAt",
      categories: "key, scope",
      tags: "key, scope",
      batches: "key, scope",
      customOrders: "scope",
      images: "key, scope",
      recoveries: "id, scope, createdAt",
    });
    this.db = db;
    this.meta = db.table("meta");
    this.todos = db.table("todos");
    this.categories = db.table("categories");
    this.tags = db.table("tags");
    this.batches = db.table("batches");
    this.customOrders = db.table("customOrders");
    this.images = db.table("images");
    this.recoveries = db.table("recoveries");
  }

  private scopeOf(projectId: string): string {
    return `${this.getUser()}\n${projectId}`;
  }

  private keyOf(scope: string, id: string): string {
    return `${scope}\n${id}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  /** 测试与恢复场景：删除整个数据库。 */
  async deleteDatabase(): Promise<void> {
    this.db.close();
    await Dexie.delete(this.db.name);
  }

  private async nextId(scope: string, prefix: string): Promise<string> {
    const meta = await this.meta.get(scope);
    const seq = (meta?.seq ?? 0) + 1;
    await this.meta.put({ scope, seededAt: meta?.seededAt ?? this.now(), seq });
    return `${prefix}-${seq}`;
  }

  private async ensureSeeded(scope: string, projectId: string): Promise<void> {
    const meta = await this.meta.get(scope);
    if (meta) return;
    const seed = projectId === "demo" ? seedProject() : emptyProject();
    const stamp = this.now();
    await this.meta.put({ scope, seededAt: stamp, seq: seed.seq });
    await this.todos.bulkPut(
      seed.todos.map((todo) => ({ ...todo, key: this.keyOf(scope, todo.id), scope })),
    );
    await this.categories.bulkPut(
      seed.categories.map((category) => ({
        ...category,
        key: this.keyOf(scope, category.id),
        scope,
      })),
    );
    await this.tags.bulkPut(
      seed.tags.map((tag) => ({ ...tag, key: this.keyOf(scope, tag.id), scope })),
    );
    await this.customOrders.put({ scope, ...seed.customOrder });
  }

  private async sweep(scope: string): Promise<void> {
    // 到期清理：运行时触发，不承诺关闭时按时清理（§4.2）。
    const expiredTodos = await this.todos
      .where("scope")
      .equals(scope)
      .filter((todo) => !!todo.deletedAt && isTrashExpired(todo.deletedAt as string))
      .primaryKeys();
    if (expiredTodos.length > 0) await this.todos.bulkDelete(expiredTodos);
    const expiredCategories = await this.categories
      .where("scope")
      .equals(scope)
      .filter((category) => !!category.deletedAt && isTrashExpired(category.deletedAt as string))
      .primaryKeys();
    if (expiredCategories.length > 0) await this.categories.bulkDelete(expiredCategories);
    const expiredTags = await this.tags
      .where("scope")
      .equals(scope)
      .filter((tag) => !!tag.deletedAt && isTrashExpired(tag.deletedAt as string))
      .primaryKeys();
    if (expiredTags.length > 0) await this.tags.bulkDelete(expiredTags);
  }

  private allTables() {
    // 事务表清单必须覆盖 ensureSeeded/sweep/stash 触及的全部表，
    // 否则缺表操作在事务内走独立事务，严格实现下直接失败。
    return [
      this.meta,
      this.todos,
      this.categories,
      this.tags,
      this.batches,
      this.customOrders,
      this.images,
      this.recoveries,
    ];
  }

  private strip<T extends ScopedRow>(row: T): Omit<T, "key" | "scope"> {
    const { key: _key, scope: _scope, ...rest } = row;
    return rest;
  }

  private async scopedTodos(scope: string): Promise<TodoRow[]> {
    return this.todos.where("scope").equals(scope).toArray();
  }

  private async scopedCategories(scope: string): Promise<CategoryRow[]> {
    return this.categories.where("scope").equals(scope).toArray();
  }

  private async scopedTags(scope: string): Promise<TagRow[]> {
    return this.tags.where("scope").equals(scope).toArray();
  }

  // ---- 任务 ----

  async listTodos(projectId: string): Promise<Todo[]> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      await this.sweep(scope);
      return (await this.scopedTodos(scope)).map((row) => ({ ...this.strip(row) }));
    });
  }

  async createTodo(projectId: string, input: CreateTodoInput): Promise<Todo> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const body = input.body ?? "";
      const createdAt = this.now();
      const id = await this.nextId(scope, "t");
      const todo: TodoRow = {
        key: this.keyOf(scope, id),
        scope,
        id,
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
      await this.todos.put(todo);
      return { ...this.strip(todo) };
    });
  }

  async updateTodo(projectId: string, id: string, patch: TodoPatch): Promise<Todo> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.todos.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "任务不存在。", 404);
      if (patch.body !== undefined) {
        row.body = patch.body;
        row.title = deriveTitle(patch.body) || "未命名 Todo";
      }
      if (patch.priority !== undefined) row.priority = patch.priority;
      if (patch.tags !== undefined) row.tags = [...patch.tags];
      if (patch.dueDate !== undefined) {
        if (patch.dueDate === null) delete row.dueDate;
        else row.dueDate = patch.dueDate;
      }
      if (patch.categoryId !== undefined) {
        if (patch.categoryId === null) delete row.categoryId;
        else row.categoryId = patch.categoryId;
      }
      row.updatedAt = this.now();
      row.revision += 1;
      await this.todos.put(row);
      return { ...this.strip(row) };
    });
  }

  async setCompleted(projectId: string, id: string, completed: boolean): Promise<Todo> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.todos.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "任务不存在。", 404);
      row.status = completed ? "completed" : "open";
      if (completed) row.completedAt = this.now();
      else delete row.completedAt;
      row.updatedAt = this.now();
      row.revision += 1;
      await this.todos.put(row);
      return { ...this.strip(row) };
    });
  }

  async deleteTodo(projectId: string, id: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.todos.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "任务不存在。", 404);
      if (!row.deletedAt) {
        row.deletedAt = this.now();
        row.updatedAt = row.deletedAt;
        row.revision += 1;
        await this.todos.put(row);
      }
    });
  }

  async restoreTodo(projectId: string, id: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.todos.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "任务不存在。", 404);
      delete row.deletedAt;
      row.updatedAt = this.now();
      row.revision += 1;
      await this.todos.put(row);
    });
  }

  async purgeTodo(projectId: string, id: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      await this.stashLocked(scope, "彻底删除任务前");
      await this.todos.delete(this.keyOf(scope, id));
      const order = await this.customOrders.get(scope);
      if (order) {
        order.inbox = order.inbox.filter((todoId) => todoId !== id);
        order.all = order.all.filter((todoId) => todoId !== id);
        await this.customOrders.put(order);
      }
    });
  }

  // ---- 目录 ----

  async listCategories(projectId: string): Promise<Category[]> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      await this.sweep(scope);
      return (await this.scopedCategories(scope)).map((row) => ({ ...this.strip(row) }));
    });
  }

  async createCategory(projectId: string, input: CreateCategoryInput): Promise<Category> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const categories = await this.scopedCategories(scope);
      const issue = categoryNameIssue(input.name);
      if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
      if (siblingNameTaken(categories, input.parentId, input.name)) {
        throw new ApiError("VALIDATION_ERROR", "同级目录已存在同名目录。", 400);
      }
      if (input.parentId) {
        const parent = categories.find((item) => item.id === input.parentId);
        if (!parent || parent.deletedAt) throw new ApiError("NOT_FOUND", "父目录不存在。", 404);
        if (depthOf(categories, input.parentId) + 1 > 3) {
          throw new ApiError("VALIDATION_ERROR", "目录最多三级。", 400);
        }
      }
      const color = input.color ?? "#8a8a8a";
      if (!isPaletteColor(color)) {
        throw new ApiError("VALIDATION_ERROR", "颜色不在预设色板中。", 400);
      }
      const createdAt = this.now();
      const id = await this.nextId(scope, "c");
      const row: CategoryRow = {
        key: this.keyOf(scope, id),
        scope,
        id,
        name: input.name.trim(),
        parentId: input.parentId,
        color,
        icon: "",
        description: "",
        orderIndex: categories.filter((item) => item.parentId === input.parentId).length,
        createdAt,
        updatedAt: createdAt,
      };
      await this.categories.put(row);
      return { ...this.strip(row) };
    });
  }

  async renameCategory(
    projectId: string,
    id: string,
    input: { name: string; color?: string },
  ): Promise<Category> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.categories.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "目录不存在。", 404);
      const categories = await this.scopedCategories(scope);
      const issue = categoryNameIssue(input.name);
      if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
      if (siblingNameTaken(categories, row.parentId, input.name, id)) {
        throw new ApiError("VALIDATION_ERROR", "同级目录已存在同名目录。", 400);
      }
      row.name = input.name.trim();
      if (input.color !== undefined) {
        if (!isPaletteColor(input.color)) {
          throw new ApiError("VALIDATION_ERROR", "颜色不在预设色板中。", 400);
        }
        row.color = input.color;
      }
      row.updatedAt = this.now();
      await this.categories.put(row);
      return { ...this.strip(row) };
    });
  }

  async moveCategory(projectId: string, id: string, parentId: string | null): Promise<Category> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.categories.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "目录不存在。", 404);
      const categories = await this.scopedCategories(scope);
      if (parentId) {
        const parent = categories.find((item) => item.id === parentId);
        if (!parent || parent.deletedAt) throw new ApiError("NOT_FOUND", "目标目录不存在。", 404);
      }
      const issue = moveCategoryIssue(categories, id, parentId);
      if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
      if (siblingNameTaken(categories, parentId, row.name, id)) {
        throw new ApiError("VALIDATION_ERROR", "目标位置已存在同名目录。", 400);
      }
      row.parentId = parentId;
      row.updatedAt = this.now();
      await this.categories.put(row);
      return { ...this.strip(row) };
    });
  }

  private descendantIds(categories: Category[], rootId: string): string[] {
    const result: string[] = [];
    const stack = categories
      .filter((item) => item.parentId === rootId && !item.deletedAt)
      .map((item) => item.id);
    while (stack.length > 0) {
      const id = stack.pop() as string;
      result.push(id);
      for (const child of categories.filter((item) => item.parentId === id && !item.deletedAt)) {
        stack.push(child.id);
      }
    }
    return result;
  }

  async deleteCategory(projectId: string, id: string): Promise<CategoryDeleteImpact> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const categories = await this.scopedCategories(scope);
      const root = categories.find((item) => item.id === id);
      if (!root) throw new ApiError("NOT_FOUND", "目录不存在。", 404);
      if (root.deletedAt) return { categories: 0, todos: 0 };
      const deletedAt = this.now();
      const subtreeIds = [id, ...this.descendantIds(categories, id)];
      for (const categoryId of subtreeIds) {
        const row = await this.categories.get(this.keyOf(scope, categoryId));
        if (row && !row.deletedAt) {
          row.deletedAt = deletedAt;
          row.updatedAt = deletedAt;
          await this.categories.put(row);
        }
      }
      const todos = await this.scopedTodos(scope);
      const batchTodoIds: string[] = [];
      for (const todo of todos) {
        if (todo.categoryId && subtreeIds.includes(todo.categoryId) && !todo.deletedAt) {
          todo.deletedAt = deletedAt;
          todo.updatedAt = deletedAt;
          todo.revision += 1;
          await this.todos.put(todo);
          batchTodoIds.push(todo.id);
        }
      }
      await this.batches.put({
        key: this.keyOf(scope, deletedAt),
        scope,
        deletedAt,
        categoryIds: subtreeIds,
        todoIds: batchTodoIds,
      });
      return { categories: subtreeIds.length, todos: batchTodoIds.length };
    });
  }

  async restoreCategory(projectId: string, id: string): Promise<CategoryRestoreResult> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.categories.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "目录不存在。", 404);
      if (!row.deletedAt) return { restoredTodos: 0, conflicts: [] };
      const batch = await this.batches.get(this.keyOf(scope, row.deletedAt));
      const conflicts: string[] = [];
      let restoredTodos = 0;
      const restoreOne = async (categoryId: string) => {
        const item = await this.categories.get(this.keyOf(scope, categoryId));
        if (!item?.deletedAt) return;
        const siblings = await this.scopedCategories(scope);
        if (siblingNameTaken(siblings, item.parentId, item.name, item.id)) {
          conflicts.push(item.name);
          return;
        }
        delete item.deletedAt;
        item.updatedAt = this.now();
        await this.categories.put(item);
      };
      if (batch) {
        for (const categoryId of batch.categoryIds) await restoreOne(categoryId);
        for (const todoId of batch.todoIds) {
          const todo = await this.todos.get(this.keyOf(scope, todoId));
          if (todo?.deletedAt === batch.deletedAt) {
            delete todo.deletedAt;
            todo.updatedAt = this.now();
            todo.revision += 1;
            await this.todos.put(todo);
            restoredTodos += 1;
          }
        }
      } else {
        await restoreOne(id);
      }
      return { restoredTodos, conflicts };
    });
  }

  async purgeCategory(projectId: string, id: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const categories = await this.scopedCategories(scope);
      const subtreeIds = [id, ...this.descendantIds(categories, id)];
      await this.stashLocked(scope, "彻底删除目录前");
      const todos = await this.scopedTodos(scope);
      const removedTodoIds = new Set(
        todos
          .filter((todo) => todo.categoryId && subtreeIds.includes(todo.categoryId))
          .map((todo) => todo.id),
      );
      await this.categories
        .where("scope")
        .equals(scope)
        .filter((category) => subtreeIds.includes(category.id))
        .delete();
      await this.todos
        .where("scope")
        .equals(scope)
        .filter((todo) => removedTodoIds.has(todo.id))
        .delete();
      const order = await this.customOrders.get(scope);
      if (order) {
        order.inbox = order.inbox.filter((todoId) => !removedTodoIds.has(todoId));
        order.all = order.all.filter((todoId) => !removedTodoIds.has(todoId));
        await this.customOrders.put(order);
      }
    });
  }

  // ---- 标签 ----

  async listTags(projectId: string): Promise<Tag[]> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      await this.sweep(scope);
      return (await this.scopedTags(scope)).map((row) => ({ ...this.strip(row) }));
    });
  }

  async createTag(projectId: string, input: CreateTagInput): Promise<Tag> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const tags = await this.scopedTags(scope);
      const issue = tagNameIssue(input.name);
      if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
      if (tagNameTaken(tags, input.name)) {
        throw new ApiError("VALIDATION_ERROR", "标签名称已存在。", 400);
      }
      const color = input.color ?? "#8a8a8a";
      if (!isPaletteColor(color)) {
        throw new ApiError("VALIDATION_ERROR", "颜色不在预设色板中。", 400);
      }
      const createdAt = this.now();
      const id = await this.nextId(scope, "tag");
      const row: TagRow = {
        key: this.keyOf(scope, id),
        scope,
        id,
        name: input.name.trim(),
        color,
        icon: "",
        description: "",
        isSystem: false,
        group: input.group?.trim() ?? "",
        createdAt,
        updatedAt: createdAt,
      };
      await this.tags.put(row);
      return { ...this.strip(row) };
    });
  }

  async renameTag(projectId: string, id: string, name: string): Promise<Tag> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.tags.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "标签不存在。", 404);
      const tags = await this.scopedTags(scope);
      const issue = tagNameIssue(name);
      if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
      if (tagNameTaken(tags, name, id)) {
        throw new ApiError("VALIDATION_ERROR", "标签名称已存在。", 400);
      }
      const previous = row.name.toLowerCase();
      row.name = name.trim();
      row.updatedAt = this.now();
      await this.tags.put(row);
      const todos = await this.scopedTodos(scope);
      for (const todo of todos) {
        const next = todo.tags.map((tagName) =>
          tagName.toLowerCase() === previous ? row.name : tagName,
        );
        if (next.join("\n") !== todo.tags.join("\n")) {
          todo.tags = next;
          todo.updatedAt = this.now();
          todo.revision += 1;
          await this.todos.put(todo);
        }
      }
      return { ...this.strip(row) };
    });
  }

  async setTagGroup(projectId: string, id: string, group: string): Promise<Tag> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.tags.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "标签不存在。", 404);
      row.group = group.trim();
      row.updatedAt = this.now();
      await this.tags.put(row);
      return { ...this.strip(row) };
    });
  }

  async deleteTagGroup(projectId: string, group: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const tags = await this.scopedTags(scope);
      for (const tag of tags) {
        if (!tag.deletedAt && tag.group === group) {
          tag.group = "";
          tag.updatedAt = this.now();
          await this.tags.put(tag);
        }
      }
    });
  }

  async deleteTag(projectId: string, id: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.tags.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "标签不存在。", 404);
      if (row.isSystem) throw new ApiError("VALIDATION_ERROR", "系统标签不可删除。", 400);
      if (!row.deletedAt) {
        row.deletedAt = this.now();
        row.updatedAt = row.deletedAt;
        await this.tags.put(row);
      }
    });
  }

  async restoreTag(projectId: string, id: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.tags.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "标签不存在。", 404);
      if (!row.deletedAt) return;
      const tags = await this.scopedTags(scope);
      if (tagNameTaken(tags, row.name, id)) {
        throw new ApiError("VALIDATION_ERROR", "已存在同名标签，请先处理冲突。", 409);
      }
      delete row.deletedAt;
      row.updatedAt = this.now();
      await this.tags.put(row);
    });
  }

  async purgeTag(projectId: string, id: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.tags.get(this.keyOf(scope, id));
      if (!row) throw new ApiError("NOT_FOUND", "标签不存在。", 404);
      await this.stashLocked(scope, "彻底删除标签前");
      const wanted = row.name.toLowerCase();
      const todos = await this.scopedTodos(scope);
      for (const todo of todos) {
        const next = todo.tags.filter((tagName) => tagName.toLowerCase() !== wanted);
        if (next.length !== todo.tags.length) {
          todo.tags = next;
          todo.updatedAt = this.now();
          todo.revision += 1;
          await this.todos.put(todo);
        }
      }
      await this.tags.delete(this.keyOf(scope, id));
    });
  }

  // ---- 回收站 / 排序 ----

  private categoryPath(categories: Category[], categoryId: string | undefined): string[] {
    const path: string[] = [];
    let current = categories.find((item) => item.id === categoryId);
    while (current) {
      path.unshift(current.name);
      current = categories.find((item) => item.id === current?.parentId);
    }
    return path;
  }

  async listTrash(projectId: string): Promise<TrashSnapshot> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      await this.sweep(scope);
      const todos = await this.scopedTodos(scope);
      const categories = await this.scopedCategories(scope);
      const tags = await this.scopedTags(scope);
      return {
        todos: todos
          .filter((todo) => todo.deletedAt)
          .map((todo) => ({
            id: todo.id,
            name: todo.title,
            deletedAt: todo.deletedAt as string,
            categoryPath: this.categoryPath(categories, todo.categoryId),
            tags: [...todo.tags],
          })),
        categories: categories
          .filter((category) => category.deletedAt)
          .map((category) => ({
            id: category.id,
            name: category.name,
            deletedAt: category.deletedAt as string,
            subCategoryCount: categories.filter(
              (item) => item.parentId === category.id && item.deletedAt,
            ).length,
            trashedTodoCount: todos.filter(
              (todo) => todo.categoryId === category.id && todo.deletedAt,
            ).length,
          })),
        tags: tags
          .filter((tag) => tag.deletedAt)
          .map((tag) => ({
            id: tag.id,
            name: tag.name,
            deletedAt: tag.deletedAt as string,
            usageCount: todos.filter((todo) =>
              todo.tags.some((tagName) => tagName.toLowerCase() === tag.name.toLowerCase()),
            ).length,
          })),
        retentionDays: 30,
      };
    });
  }

  async emptyTrash(projectId: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      await this.stashLocked(scope, "清空回收站前");
      const removedTodoIds = new Set(
        (await this.scopedTodos(scope)).filter((todo) => todo.deletedAt).map((todo) => todo.id),
      );
      await this.todos
        .where("scope")
        .equals(scope)
        .filter((todo) => !!todo.deletedAt)
        .delete();
      await this.categories
        .where("scope")
        .equals(scope)
        .filter((category) => !!category.deletedAt)
        .delete();
      await this.tags
        .where("scope")
        .equals(scope)
        .filter((tag) => !!tag.deletedAt)
        .delete();
      await this.batches.where("scope").equals(scope).delete();
      const order = await this.customOrders.get(scope);
      if (order) {
        order.inbox = order.inbox.filter((todoId) => !removedTodoIds.has(todoId));
        order.all = order.all.filter((todoId) => !removedTodoIds.has(todoId));
        await this.customOrders.put(order);
      }
    });
  }

  async getCustomOrder(projectId: string): Promise<CustomOrder> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const order = await this.customOrders.get(scope);
      return { inbox: [...(order?.inbox ?? [])], all: [...(order?.all ?? [])] };
    });
  }

  async setCustomOrder(projectId: string, view: "inbox" | "all", ids: string[]): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const order = (await this.customOrders.get(scope)) ?? { scope, inbox: [], all: [] };
      const deletedIds = new Set(
        (await this.scopedTodos(scope)).filter((todo) => todo.deletedAt).map((todo) => todo.id),
      );
      const merged = [...ids];
      for (const id of order[view]) {
        if (!merged.includes(id) && deletedIds.has(id)) merged.push(id);
      }
      order[view] = merged;
      await this.customOrders.put(order);
    });
  }

  // ---- 图片 ----

  async putImage(projectId: string, path: string, blob: Blob): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      await this.images.put({
        key: this.keyOf(scope, path),
        scope,
        path,
        blob,
        createdAt: this.now(),
      });
      storeImageBlob(path, blob);
    });
  }

  async listImages(projectId: string): Promise<ContentImage[]> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const rows = await this.images.where("scope").equals(scope).toArray();
      for (const row of rows) storeImageBlob(row.path, row.blob);
      return rows.map((row) => ({ path: row.path, blob: row.blob }));
    });
  }

  // ---- 快照与恢复副本 ----

  async exportSnapshot(projectId: string): Promise<ContentSnapshot> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const [todos, categories, tags, order, images] = await Promise.all([
        this.scopedTodos(scope),
        this.scopedCategories(scope),
        this.scopedTags(scope),
        this.customOrders.get(scope),
        this.images.where("scope").equals(scope).toArray(),
      ]);
      return {
        version: 1,
        exportedAt: this.now(),
        todos: todos.map((row) => ({ ...this.strip(row) })),
        categories: categories.map((row) => ({ ...this.strip(row) })),
        tags: tags.map((row) => ({ ...this.strip(row) })),
        customOrder: { inbox: [...(order?.inbox ?? [])], all: [...(order?.all ?? [])] },
        images: images.map((row) => ({ path: row.path, blob: row.blob })),
      };
    });
  }

  private validateSnapshot(snapshot: ContentSnapshot): string {
    if (!snapshot || snapshot.version !== 1) return "不支持的快照版本。";
    if (!Array.isArray(snapshot.todos) || !Array.isArray(snapshot.categories))
      return "快照内容损坏。";
    if (!Array.isArray(snapshot.tags) || !Array.isArray(snapshot.images)) return "快照内容损坏。";
    for (const image of snapshot.images) {
      if (!(image.blob instanceof Blob)) return "快照图片损坏。";
      if (image.blob.size > 10 * 1024 * 1024) return "快照中存在超限图片。";
    }
    return "";
  }

  private async replaceLocked(scope: string, snapshot: ContentSnapshot): Promise<void> {
    for (const table of [this.todos, this.categories, this.tags, this.batches, this.images]) {
      await table.where("scope").equals(scope).delete();
    }
    await this.todos.bulkPut(
      snapshot.todos.map((todo) => ({ ...todo, key: this.keyOf(scope, todo.id), scope })),
    );
    await this.categories.bulkPut(
      snapshot.categories.map((category) => ({
        ...category,
        key: this.keyOf(scope, category.id),
        scope,
      })),
    );
    await this.tags.bulkPut(
      snapshot.tags.map((tag) => ({ ...tag, key: this.keyOf(scope, tag.id), scope })),
    );
    await this.customOrders.put({ scope, ...snapshot.customOrder });
    await this.images.bulkPut(
      snapshot.images.map((image) => ({
        key: this.keyOf(scope, image.path),
        scope,
        path: image.path,
        blob: image.blob,
        createdAt: this.now(),
      })),
    );
  }

  async importSnapshot(projectId: string, snapshot: ContentSnapshot): Promise<void> {
    const issue = this.validateSnapshot(snapshot);
    if (issue) throw new ApiError("VALIDATION_ERROR", issue, 400);
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      // 先保留当前内容恢复副本，再事务切换；失败由事务回滚保证不形成半份项目。
      await this.stashLocked(scope, "导入快照前");
      await this.replaceLocked(scope, snapshot);
    });
  }

  private async snapshotLocked(scope: string): Promise<ContentSnapshot> {
    const [todos, categories, tags, order, images] = await Promise.all([
      this.scopedTodos(scope),
      this.scopedCategories(scope),
      this.scopedTags(scope),
      this.customOrders.get(scope),
      this.images.where("scope").equals(scope).toArray(),
    ]);
    return {
      version: 1,
      exportedAt: this.now(),
      todos: todos.map((row) => ({ ...this.strip(row) })),
      categories: categories.map((row) => ({ ...this.strip(row) })),
      tags: tags.map((row) => ({ ...this.strip(row) })),
      customOrder: { inbox: [...(order?.inbox ?? [])], all: [...(order?.all ?? [])] },
      images: images.map((row) => ({ path: row.path, blob: row.blob })),
    };
  }

  private async stashLocked(scope: string, label: string): Promise<RecoveryRow> {
    const snapshot = await this.snapshotLocked(scope);
    const row: RecoveryRow = {
      id: `recovery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scope,
      label,
      createdAt: this.now(),
      snapshot,
    };
    await this.recoveries.put(row);
    const all = await this.recoveries.where("scope").equals(scope).sortBy("createdAt");
    const overflow = all.slice(0, Math.max(0, all.length - MAX_RECOVERIES));
    if (overflow.length > 0) {
      await this.recoveries.bulkDelete(overflow.map((item) => item.id));
    }
    return row;
  }

  async stashRecovery(projectId: string, label: string): Promise<RecoveryCopy> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.stashLocked(scope, label);
      return { id: row.id, label: row.label, createdAt: row.createdAt };
    });
  }

  async listRecoveries(projectId: string): Promise<RecoveryCopy[]> {
    const scope = this.scopeOf(projectId);
    return this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const rows = await this.recoveries.where("scope").equals(scope).sortBy("createdAt");
      return rows
        .reverse()
        .map((row) => ({ id: row.id, label: row.label, createdAt: row.createdAt }));
    });
  }

  async restoreRecovery(projectId: string, id: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.recoveries.get(id);
      if (!row || row.scope !== scope) throw new ApiError("NOT_FOUND", "恢复副本不存在。", 404);
      await this.stashLocked(scope, "恢复副本前");
      await this.replaceLocked(scope, row.snapshot);
    });
  }

  async deleteRecovery(projectId: string, id: string): Promise<void> {
    const scope = this.scopeOf(projectId);
    await this.db.transaction("rw", this.allTables(), async () => {
      await this.ensureSeeded(scope, projectId);
      const row = await this.recoveries.get(id);
      if (!row || row.scope !== scope) throw new ApiError("NOT_FOUND", "恢复副本不存在。", 404);
      await this.recoveries.delete(id);
    });
  }
}
