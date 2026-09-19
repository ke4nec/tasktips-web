import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  parseIndex,
  parseTodoDoc,
  serializeClassification,
  serializeIndex,
  serializeTodo,
  sha256Hex,
  todoFromDoc,
  utf8Length,
} from "@/sync/serialize";
import type { Todo } from "@/domain/types";

function todo(): Todo {
  return {
    id: "t-1",
    title: "标题",
    body: "# 标题\n\n正文含中文与 `code`。",
    status: "open",
    priority: 2,
    tags: ["工作", "含 特殊:字符"],
    dueDate: "2026-09-19",
    categoryId: "c-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    revision: 3,
  };
}

describe("Todo front matter 往返", () => {
  it("序列化解析一致，未知字段保留", () => {
    const payload = serializeTodo(todo(), "dev-1");
    expect(payload.startsWith("---\n")).toBe(true);
    const doc = parseTodoDoc(payload);
    expect(doc.fields.schemaVersion).toBe(1);
    const restored = todoFromDoc("t-1", doc, 1);
    expect(restored.body).toBe(todo().body);
    expect(restored.tags).toEqual(["工作", "含 特殊:字符"]);
    expect(restored.priority).toBe(2);
    expect(restored.dueDate).toBe("2026-09-19");
  });

  it("未知字段经 extra 保留", () => {
    const payload = `---\nfoo: bar\ncount: 3\n---\n正文\n`;
    const doc = parseTodoDoc(payload);
    expect(doc.extra).toEqual({ foo: "bar", count: 3 });
  });

  it("CRLF 输入规范化", () => {
    const doc = parseTodoDoc("---\r\nstatus: open\r\n---\r\n正文\r\n");
    expect(doc.body).toBe("正文");
  });
});

describe("索引规范形态", () => {
  it("递归键排序、两空格缩进、空 customOrder 省略", () => {
    const payload = serializeIndex({
      customOrder: { inbox: ["b", "a"], all: [] },
      tombstones: [
        { kind: "todo", id: "x", revision: 2, deletedAt: "2026-09-01T00:00:00Z", projectId: "p" },
      ],
    });
    expect(payload).toContain('"inbox": [\n      "b",\n      "a"\n    ]');
    expect(payload).not.toContain('"all"');
    expect(payload).not.toContain("lastScanAt");
    const parsed = parseIndex(payload);
    expect(parsed.customOrder.inbox).toEqual(["b", "a"]);
  });

  it("缺 deletedAt 的墓碑拒绝", () => {
    expect(() =>
      parseIndex('{"tombstones": [{"kind": "todo", "id": "x", "revision": 1}]}'),
    ).toThrow("必填字段");
  });

  it("canonicalJson 字典序", () => {
    expect(canonicalJson({ b: 1, a: { d: 1, c: 1 } })).toBe(
      '{\n  "a": {\n    "c": 1,\n    "d": 1\n  },\n  "b": 1\n}',
    );
  });
});

describe("分类序列化", () => {
  it("内容 schemaVersion=3", () => {
    const payload = serializeClassification([], [], { keep: true });
    const parsed = JSON.parse(payload) as { schemaVersion: number; keep: boolean };
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.keep).toBe(true);
  });
});

describe("哈希", () => {
  it("SHA-256 稳定", async () => {
    expect(await sha256Hex("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(utf8Length("中文")).toBe(6);
  });
});
