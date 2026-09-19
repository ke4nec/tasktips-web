import "fake-indexeddb/auto";

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { exportBackup, parseBackup } from "@/backup/backup";
import { DexieContent } from "@/content/dexie";

let seq = 0;
let content: DexieContent;

beforeEach(() => {
  seq += 1;
  content = new DexieContent(() => "u", `tasktips-backup-test-${seq}`);
});

afterEach(async () => {
  await content.deleteDatabase();
});

describe("备份往返（兼容移动端 formatVersion: 1）", () => {
  it("导出导入一致，当前内容先保留副本", async () => {
    const blob = await exportBackup(content, "demo", "dev-1");
    expect(blob.size).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(blob);
    expect(zip.file("manifest.json")).not.toBeNull();
    const manifest = JSON.parse((await zip.file("manifest.json")?.async("string")) ?? "{}") as {
      format: string;
      formatVersion: number;
    };
    expect(manifest.format).toBe("tasktips-backup");
    expect(manifest.formatVersion).toBe(1);
    expect(Object.keys(zip.files).some((name) => name.startsWith("content/tips/"))).toBe(true);

    const before = (await content.listTodos("demo")).length;
    const parsed = await parseBackup(content, "demo", blob);
    expect(parsed.preview.todos).toBe(before);
    await parsed.apply();
    expect((await content.listTodos("demo")).length).toBe(before);
    // 导入前自动保留恢复副本
    expect((await content.listRecoveries("demo")).length).toBeGreaterThan(0);
  });

  it("拒绝非法输入且不动现状", async () => {
    const before = await content.listTodos("demo");
    // 非 ZIP
    await expect(
      parseBackup(content, "demo", new Blob(["not-a-zip"], { type: "application/zip" })),
    ).rejects.toThrow("ZIP");
    // 缺 manifest
    const empty = await new JSZip().generateAsync({ type: "blob" });
    await expect(parseBackup(content, "demo", empty)).rejects.toThrow("manifest");
    // 目录穿越
    const evil = new JSZip();
    evil.file("manifest.json", JSON.stringify({ format: "tasktips-backup", formatVersion: 1 }));
    evil.file("content/classification.json", JSON.stringify({ categories: [], tags: [] }));
    evil.file("content/index.json", JSON.stringify({ customOrder: {}, tombstones: [] }));
    evil.file("content/tips/../../evil.md", "x");
    const evilBlob = await evil.generateAsync({ type: "blob" });
    await expect(parseBackup(content, "demo", evilBlob)).rejects.toThrow("非法路径");
    expect((await content.listTodos("demo")).length).toBe(before.length);
  });
});
