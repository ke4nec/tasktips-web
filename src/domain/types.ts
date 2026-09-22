// 领域类型：由桌面端 src/types.ts 移植，剔除 Tauri 窗口/同步/IPC 专有部分。
// Web 的同步信封与传输形态在 P6 定义，此处仅为业务语义。
export type TodoStatus = "open" | "completed";

export type TodoPriority = 0 | 1 | 2 | 3;

export interface Todo {
  extra?: Record<string, unknown>;
  /** 仅本地保存：未修改文档按原始字节同步。 */
  source?: { raw: string; fingerprint: string };
  id: string;
  title: string;
  body: string;
  status: TodoStatus;
  priority: TodoPriority;
  tags: string[];
  dueDate?: string; // YYYY-MM-DD，本地日历日期，不转 UTC
  categoryId?: string; // 缺省为未分类
  createdAt: string; // RFC 3339 UTC
  updatedAt: string; // RFC 3339 UTC
  completedAt?: string;
  deletedAt?: string; // 置位即在回收站
  revision: number;
  /** 创建设备（§7.1 保留创建设备；同步提交设备另行传递，不覆盖此字段）。 */
  deviceId?: string;
  /** 本机演示种子标记（仅本地意，不同步不序列化）；任何用户修改后清除。 */
  seeded?: boolean;
}

export type TodoView = "inbox" | "today" | "upcoming" | "completed" | "all";

export type DueDateFilter = "any" | "overdue" | "today" | "none";

export type StatusFilter = "any" | "open" | "completed";

export type SortKey = "updatedAt" | "createdAt" | "dueDate" | "priority" | "title";

export type SortDirection = "asc" | "desc";

export type TagFilterMode = "and" | "or" | "exclude";

export interface TodoQuery {
  view: TodoView;
  search?: string;
  tags?: string[];
  tagMode?: TagFilterMode;
  priorities?: TodoPriority[];
  categoryIds?: string[];
  uncategorized?: boolean;
  dueDate?: DueDateFilter;
  status?: StatusFilter;
  sort?: [SortKey, SortDirection];
}

export interface CreateTodoInput {
  body?: string;
  priority?: TodoPriority;
  tags?: string[];
  dueDate?: string;
  categoryId?: string;
}

export interface TodoPatch {
  body?: string;
  priority?: TodoPriority;
  tags?: string[];
  dueDate?: string | null;
  categoryId?: string | null;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  icon: string;
  description: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  /** 本机演示种子标记（仅本地意，不同步不序列化）；任何用户修改后清除。 */
  seeded?: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  isSystem: boolean;
  group: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  /** 本机演示种子标记（仅本地意，不同步不序列化）；任何用户修改后清除。 */
  seeded?: boolean;
}

export interface CategoryNode extends Category {
  level: 1 | 2 | 3;
  todoCount: number;
  children: CategoryNode[];
}

export interface TagGroup {
  name: string;
  tags: Tag[];
}

export type TrashItemType = "todo" | "category" | "tag";

export interface TrashItem {
  id: string;
  name: string;
  deletedAt: string;
  subCategoryCount?: number;
  trashedTodoCount?: number;
  categoryPath?: string[];
  tags?: string[];
  usageCount?: number;
}

export interface ViewCounts {
  inbox: number;
  today: number;
  upcoming: number;
  completed: number;
  all: number;
}

export const TRASH_RETENTION_DAYS = 30;

export const DEFAULT_TAG_GROUP = "其他";

export const UNCATEGORIZED_LABEL = "未分类";
