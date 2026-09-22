import { parseDocument, stringify } from "yaml";
import { deriveTitle } from "@/domain/title";
import type { Category, Tag, Todo } from "@/domain/types";
import { SyncError } from "./protocol";

// 内容字节序列化（设计文档 §7.1）：唯一可同步/可导出的依据。
// - Todo：完整 Markdown + YAML front matter，schemaVersion=1，≤8 MiB。
// - 分类：JSON schemaVersion=3，≤5 MiB；信封 schemaVersion 恒为 1，二者严格区分。
// - 索引：递归键排序、两空格缩进的规范形态，排除本机 lastScanAt，≤5 MiB。
// - 未知 front matter / 实体字段原样保留；只读操作不重写 payload。
export const TODO_SCHEMA_VERSION = 1;
export const CLASSIFICATION_SCHEMA_VERSION = 3;
export const INDEX_SCHEMA_VERSION = 1;

export const TODO_PAYLOAD_MAX = 8 * 1024 * 1024;
export const CLASSIFICATION_PAYLOAD_MAX = 5 * 1024 * 1024;
export const INDEX_PAYLOAD_MAX = 5 * 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface ParsedTodoDoc {
  raw: string;
  fields: Record<string, unknown>;
  extra: Record<string, unknown>;
  body: string;
}

export function parseTodoDoc(payload: string): ParsedTodoDoc {
  const normalized = payload.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") {
    return { raw: payload, fields: {}, extra: {}, body: normalized };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---" || lines[i] === "...") {
      end = i;
      break;
    }
  }
  if (end === -1) throw new SyncError("SCHEMA_UNSUPPORTED", "Todo 缺少 front matter 结束标记。");
  const document = parseDocument(lines.slice(1, end).join("\n"), { uniqueKeys: true });
  if (document.errors.length)
    throw new SyncError("SCHEMA_UNSUPPORTED", "Todo front matter 不是合法 YAML。");
  let fields: Record<string, unknown>;
  try {
    fields = document.toJS({ maxAliasCount: 100 }) as Record<string, unknown>;
  } catch {
    throw new SyncError("SCHEMA_UNSUPPORTED", "Todo front matter 结构不支持。");
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new SyncError("SCHEMA_UNSUPPORTED", "Todo front matter 必须是字段映射。");
  }
  if (
    (fields.schemaVersion !== undefined && fields.schemaVersion !== 1) ||
    (fields.status !== undefined && fields.status !== "open" && fields.status !== "completed") ||
    (fields.priority !== undefined && ![0, 1, 2, 3].includes(fields.priority as number)) ||
    (fields.tags != null &&
      (!Array.isArray(fields.tags) ||
        fields.tags.some((tag: unknown) => typeof tag !== "string"))) ||
    (fields.revision !== undefined &&
      (!Number.isSafeInteger(fields.revision) || Number(fields.revision) < 0))
  ) {
    throw new SyncError("SCHEMA_UNSUPPORTED", "Todo front matter 字段不受支持。");
  }
  // 序列化恒追加一个换行，解析时剥离一个以互逆（§7.1 真实修改才规范化）。
  const body = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\n/, "")
    .replace(/\n$/, "");
  const known = new Set([
    "id",
    "title",
    "status",
    "priority",
    "tags",
    "dueDate",
    "categoryId",
    "deletedAt",
    "createdAt",
    "updatedAt",
    "completedAt",
    "revision",
    "deviceId",
    "schemaVersion",
  ]);
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!known.has(key)) extra[key] = value;
  }
  return { raw: payload, fields, extra, body };
}

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value);
  // 需引用的情况：含特殊字符、前后空格或与 YAML 关键字冲突时用双引号 JSON 风格。
  if (
    /[:#\[\]{},&*!|>'"%@` \t\n]/.test(text) ||
    text === "" ||
    /^(true|false|null|~|[0-9])/i.test(text)
  ) {
    return JSON.stringify(text);
  }
  return text;
}

function todoFingerprint(todo: Todo): string {
  const { source: _source, seeded: _seeded, ...fields } = todo;
  return canonicalJson(fields);
}

export function serializeTodo(todo: Todo, deviceId: string): string {
  // 未编辑的远端文档保留原始字节、注释、字段顺序和换行。
  if (todo.source && todo.source.fingerprint === todoFingerprint(todo)) return todo.source.raw;
  const tags = todo.tags.map((tag) => `  - ${yamlScalar(tag)}`).join("\n");
  const lines = [
    "---",
    `id: ${yamlScalar(todo.id)}`,
    `title: ${yamlScalar(todo.title)}`,
    `status: ${yamlScalar(todo.status)}`,
    `priority: ${todo.priority}`,
    "tags:",
    tags,
  ];
  if (todo.dueDate !== undefined) lines.push(`dueDate: ${yamlScalar(todo.dueDate)}`);
  if (todo.categoryId !== undefined) lines.push(`categoryId: ${yamlScalar(todo.categoryId)}`);
  if (todo.deletedAt !== undefined) lines.push(`deletedAt: ${yamlScalar(todo.deletedAt)}`);
  lines.push(`createdAt: ${yamlScalar(todo.createdAt)}`);
  lines.push(`updatedAt: ${yamlScalar(todo.updatedAt)}`);
  if (todo.completedAt !== undefined) lines.push(`completedAt: ${yamlScalar(todo.completedAt)}`);
  lines.push(`revision: ${todo.revision}`);
  // 保留创建设备；新建（无）时用本次提交设备（§7.1）。
  lines.push(`deviceId: ${yamlScalar(todo.deviceId ?? deviceId)}`);
  lines.push(`schemaVersion: ${TODO_SCHEMA_VERSION}`);
  for (const [key, value] of Object.entries(
    (todo as unknown as { extra?: Record<string, unknown> }).extra ?? {},
  )) {
    // 复杂字段使用完整 YAML；旧版标量保持字节兼容，避免升级时误判为脏数据。
    if (/^[A-Za-z0-9_-]+$/.test(key) && (value === null || typeof value !== "object")) {
      lines.push(`${key}: ${yamlScalar(value)}`);
    } else {
      lines.push(stringify({ [key]: value }).trimEnd());
    }
  }
  lines.push("---", todo.body);
  const payload = `${lines.join("\n")}\n`;
  if (encoder.encode(payload).length > TODO_PAYLOAD_MAX) {
    throw new SyncError("PAYLOAD_TOO_LARGE", `任务 ${todo.id} 超过 8 MiB。`);
  }
  return payload;
}

export function todoFromDoc(
  id: string,
  doc: ParsedTodoDoc,
  fallbackRevision: number,
): Todo & { extra?: Record<string, unknown> } {
  const fields = doc.fields;
  if (fields.id !== undefined && fields.id !== id) {
    throw new SyncError("SCHEMA_UNSUPPORTED", "Todo ID 与同步对象不一致。");
  }
  const status = fields.status === "completed" ? "completed" : "open";
  const priority = [0, 1, 2, 3].includes(Number(fields.priority)) ? Number(fields.priority) : 0;
  const tags = Array.isArray(fields.tags) ? fields.tags.map(String) : [];
  const todo: Todo & { extra?: Record<string, unknown> } = {
    id: String(fields.id ?? id),
    title: deriveTitle(doc.body) || "未命名 Todo",
    body: doc.body,
    status,
    priority: priority as Todo["priority"],
    tags,
    createdAt: String(fields.createdAt ?? ""),
    updatedAt: String(fields.updatedAt ?? ""),
    revision: Number(fields.revision ?? fallbackRevision),
  };
  if (fields.dueDate !== undefined && fields.dueDate !== null)
    todo.dueDate = String(fields.dueDate);
  if (fields.categoryId !== undefined && fields.categoryId !== null) {
    todo.categoryId = String(fields.categoryId);
  }
  if (fields.deletedAt) todo.deletedAt = String(fields.deletedAt);
  if (fields.completedAt) todo.completedAt = String(fields.completedAt);
  if (fields.deviceId !== undefined && fields.deviceId !== null) {
    todo.deviceId = String(fields.deviceId);
  }
  if (Object.keys(doc.extra).length > 0) todo.extra = doc.extra;
  todo.source = { raw: doc.raw, fingerprint: todoFingerprint(todo) };
  return todo;
}

// 递归键排序的规范 JSON（索引/墓碑可靠性所依赖，§7.1）。
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const result: Record<string, unknown> = {};
    for (const [key, item] of entries) result[key] = sortKeys(item);
    return result;
  }
  return value;
}

export interface IndexData {
  customOrder: { inbox: string[]; all: string[] };
  tombstones: {
    kind: string;
    id: string;
    revision: number;
    deletedAt: string;
    projectId: string;
  }[];
}

export function serializeIndex(index: IndexData): string {
  // 同步规范形态排除本机 lastScanAt（§7.1）。
  const payload = canonicalJson({
    schemaVersion: INDEX_SCHEMA_VERSION,
    customOrder: {
      ...(index.customOrder.inbox.length > 0 ? { inbox: index.customOrder.inbox } : {}),
      ...(index.customOrder.all.length > 0 ? { all: index.customOrder.all } : {}),
    },
    tombstones: index.tombstones,
  });
  if (encoder.encode(payload).length > INDEX_PAYLOAD_MAX) {
    throw new SyncError("PAYLOAD_TOO_LARGE", "索引超过 5 MiB。");
  }
  return payload;
}

export function parseIndex(payload: string): IndexData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new SyncError("SCHEMA_UNSUPPORTED", "索引不是合法 JSON。");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new SyncError("SCHEMA_UNSUPPORTED", "索引结构不支持。");
  }
  const record = parsed as Record<string, unknown>;
  const customOrder = (record.customOrder ?? {}) as Record<string, unknown>;
  const tombstones = (record.tombstones ?? []) as IndexData["tombstones"];
  for (const tomb of tombstones) {
    if (!tomb.deletedAt || !tomb.id || !tomb.kind) {
      throw new SyncError("SCHEMA_UNSUPPORTED", "墓碑缺少必填字段。");
    }
  }
  return {
    customOrder: {
      inbox: Array.isArray(customOrder.inbox) ? customOrder.inbox.map(String) : [],
      all: Array.isArray(customOrder.all) ? customOrder.all.map(String) : [],
    },
    tombstones,
  };
}

export function serializeClassification(
  categories: Category[],
  tags: Tag[],
  fileExtra?: Record<string, unknown>,
): string {
  const payload = canonicalJson({
    ...(fileExtra ?? {}),
    schemaVersion: CLASSIFICATION_SCHEMA_VERSION,
    categories: categories.map((category) => ({
      ...(category as unknown as { extra?: Record<string, unknown> }).extra,
      id: category.id,
      parentId: category.parentId,
      name: category.name,
      color: category.color,
      icon: category.icon,
      description: category.description,
      orderIndex: category.orderIndex,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      ...(category.deletedAt ? { deletedAt: category.deletedAt } : {}),
    })),
    tags: tags.map((tag) => ({
      ...(tag as unknown as { extra?: Record<string, unknown> }).extra,
      id: tag.id,
      name: tag.name,
      color: tag.color,
      icon: tag.icon,
      description: tag.description,
      isSystem: tag.isSystem,
      group: tag.group,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
      ...(tag.deletedAt ? { deletedAt: tag.deletedAt } : {}),
    })),
  });
  if (encoder.encode(payload).length > CLASSIFICATION_PAYLOAD_MAX) {
    throw new SyncError("PAYLOAD_TOO_LARGE", "分类超过 5 MiB。");
  }
  return payload;
}

export function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

export function decodeUtf8(bytes: ArrayBuffer): string {
  return decoder.decode(bytes);
}
