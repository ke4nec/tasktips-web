import JSZip from "jszip";

import type { ContentPort } from "@/content/port";
import { parseIndex, parseTodoDoc, serializeTodo, todoFromDoc } from "@/sync/serialize";
import type { Category, Tag, Todo } from "@/domain/types";

export const BACKUP_FORMAT = "tasktips-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const APP_VERSION = "0.1.0";

const MAX_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export interface BackupPreview {
  todos: number;
  categories: number;
  tags: number;
  images: number;
  exportedAt: string;
}

// 导出 ZIP：根级 manifest.json + content/tips/*.md + images + classification/index。
// 不包含账号令牌、设备身份、同步基线、未完成请求和本机设置（§10.2）。
export async function exportBackup(
  content: ContentPort,
  projectId: string,
  deviceId: string,
): Promise<Blob> {
  const snapshot = await content.exportSnapshot(projectId);
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  for (const todo of snapshot.todos) {
    zip.file(`content/tips/${todo.id}.md`, serializeTodo(todo, deviceId));
  }
  for (const image of snapshot.images) {
    zip.file(`content/tips/images/${image.path.replace(/^images\//, "")}`, image.blob);
  }
  const { serializeClassification, serializeIndex } = await import("@/sync/serialize");
  zip.file(
    "content/classification.json",
    serializeClassification(snapshot.categories, snapshot.tags),
  );
  zip.file(
    "content/index.json",
    serializeIndex({ customOrder: snapshot.customOrder, tombstones: [] }),
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

interface ParsedBackup {
  preview: BackupPreview;
  apply: () => Promise<void>;
}

// 导入先校验后预览，用户确认后再事务切换（§10.2）。
export async function parseBackup(
  content: ContentPort,
  projectId: string,
  file: Blob,
): Promise<ParsedBackup> {
  if (file.size > MAX_ZIP_BYTES) throw new BackupError("备份文件过大。");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new BackupError("不是有效的 ZIP 备份。");
  }
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new BackupError("缺少 manifest.json。");
  const manifest = JSON.parse(await manifestFile.async("string")) as {
    format?: string;
    formatVersion?: number;
    exportedAt?: string;
  };
  if (manifest.format !== BACKUP_FORMAT || manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupError("不支持的备份版本。");
  }
  const todos: Todo[] = [];
  const images: { path: string; blob: Blob }[] = [];
  const entries = Object.keys(zip.files);
  for (const name of entries) {
    // 拒绝绝对路径、目录穿越与 manifest 外非法项（§10.2）。
    if (
      name.startsWith("/") ||
      name.includes("..") ||
      name.includes("\\") ||
      (!name.startsWith("content/") && name !== "manifest.json")
    ) {
      throw new BackupError(`非法路径：${name}`);
    }
  }
  const tipsPrefix = "content/tips/";
  for (const name of entries) {
    if (!name.startsWith(tipsPrefix) || name.endsWith("/")) continue;
    const relative = name.slice(tipsPrefix.length);
    if (relative.startsWith("images/")) {
      const fileName = relative.slice("images/".length);
      if (!fileName || fileName.includes("/")) throw new BackupError(`非法图片路径：${name}`);
      const data = await zip.file(name)?.async("arraybuffer");
      if (!data) throw new BackupError(`图片读取失败：${name}`);
      if (data.byteLength > MAX_ENTRY_BYTES) throw new BackupError(`图片超限：${name}`);
      images.push({ path: `images/${fileName}`, blob: new Blob([data]) });
      continue;
    }
    if (!relative.endsWith(".md") || relative.includes("/")) {
      throw new BackupError(`非法任务路径：${name}`);
    }
    const text = await zip.file(name)?.async("string");
    if (text === undefined) throw new BackupError(`任务读取失败：${name}`);
    if (new TextEncoder().encode(text).length > 8 * 1024 * 1024) {
      throw new BackupError(`任务超限：${name}`);
    }
    const id = relative.slice(0, -".md".length);
    const doc = parseTodoDoc(text);
    const todo = todoFromDoc(id, doc, 1);
    // 标题由正文派生（与编辑器一致）。
    const { deriveTitle } = await import("@/domain/title");
    todo.title = deriveTitle(todo.body) || "未命名 Todo";
    todos.push(todo);
  }
  const classificationFile = zip.file("content/classification.json");
  if (!classificationFile) throw new BackupError("缺少 content/classification.json。");
  const classification = JSON.parse(await classificationFile.async("string")) as {
    categories: Category[];
    tags: Tag[];
  };
  if (!Array.isArray(classification.categories) || !Array.isArray(classification.tags)) {
    throw new BackupError("分类内容损坏。");
  }
  const indexFile = zip.file("content/index.json");
  if (!indexFile) throw new BackupError("缺少 content/index.json。");
  const index = parseIndex(await indexFile.async("string"));

  const preview: BackupPreview = {
    todos: todos.length,
    categories: classification.categories.length,
    tags: classification.tags.length,
    images: images.length,
    exportedAt: manifest.exportedAt ?? "",
  };

  return {
    preview,
    apply: async () => {
      // 经 importSnapshot 事务切换：先保留恢复副本，失败回滚不形成半份项目。
      // 恢复内容作为本机改动参与下次同步，不导入旧设备提交上下文（§10.2）。
      await content.importSnapshot(projectId, {
        version: 1,
        exportedAt: new Date().toISOString(),
        todos,
        categories: classification.categories,
        tags: classification.tags,
        customOrder: index.customOrder,
        images,
      });
    },
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
