import { describe, expect, it } from "vitest";

import {
  formatCloudTimestamp,
  parseCloudTimestamp,
  toHistoryEntry,
  toPortChange,
  toPortPushResult,
  type WireChangeForTest,
} from "@/api/httpSync";
import type { PushRequest } from "@/sync/protocol";

const request: PushRequest = {
  requestId: "req-1",
  generation: 3,
  objects: [
    { kind: "todo", id: "t-1", baseRevision: 4, revision: 5, hash: "aa" },
    { kind: "classification", id: "classification", baseRevision: 1, revision: 2, hash: "bb" },
  ],
  tombstones: [{ kind: "todo", id: "t-2", baseRevision: 2, revision: 3, deletedAt: "x" }],
};

describe("httpSync 线格式映射", () => {
  it("对象信封映射哈希，墓碑映射删除时间", () => {
    const object = toPortChange(
      {
        type: "object",
        kind: "todo",
        id: "t-1",
        revision: 5,
        contentHash: "deadbeef",
      } as WireChangeForTest,
      "p-1",
    );
    expect(object).toEqual({ kind: "todo", id: "t-1", revision: 5, hash: "deadbeef" });

    const tombstone = toPortChange(
      {
        type: "tombstone",
        kind: "todo",
        id: "t-2",
        revision: 3,
        deletedAt: "2026-01-01T00:00:00Z",
      } as WireChangeForTest,
      "p-1",
    );
    expect(tombstone).toEqual({
      kind: "todo",
      id: "t-2",
      revision: 3,
      deletedAt: "2026-01-01T00:00:00Z",
      projectId: "p-1",
    });
  });

  it("历史条目映射序号与删除标记", () => {
    const entry = toHistoryEntry({
      type: "object",
      kind: "index",
      id: "index",
      revision: 7,
      contentHash: "cc",
      updatedAt: "2026-02-02T00:00:00Z",
      changeSequence: 42,
    } as WireChangeForTest);
    expect(entry).toEqual({
      sequence: 42,
      kind: "index",
      id: "index",
      revision: 7,
      hash: "cc",
      deleted: false,
      at: "2026-02-02T00:00:00.000Z",
    });
  });

  it("push 结果：applied 回填请求哈希，conflict 映射实际版本，rejected 保留错误码", () => {
    const applied = toPortPushResult(
      { status: "applied", kind: "todo", id: "t-1", revision: 5 },
      request,
    );
    expect(applied).toEqual({
      kind: "todo",
      id: "t-1",
      status: "applied",
      revision: 5,
      remoteHash: "aa",
    });

    const appliedTombstone = toPortPushResult(
      { status: "applied", kind: "todo", id: "t-2", revision: 3 },
      request,
    );
    expect(appliedTombstone.remoteHash).toBeUndefined();

    const conflict = toPortPushResult(
      { status: "conflict", kind: "todo", id: "t-1", actualRevision: 9 },
      request,
    );
    expect(conflict).toEqual({
      kind: "todo",
      id: "t-1",
      status: "conflict",
      remoteRevision: 9,
    });

    const rejected = toPortPushResult(
      { status: "rejected", kind: "todo", id: "t-1", code: "SCHEMA_UNSUPPORTED" },
      request,
    );
    expect(rejected).toEqual({
      kind: "todo",
      id: "t-1",
      status: "rejected",
      code: "SCHEMA_UNSUPPORTED",
    });
  });
});

describe("formatCloudTimestamp", () => {
  it("输出云端 time crate 的线格式（空格分隔+小数秒+三段 UTC 偏移）", () => {
    const date = new Date("2026-09-20T16:40:12.345Z");
    expect(formatCloudTimestamp(date)).toBe("2026-09-20 16:40:12.345 +00:00:00");
  });
});

describe("parseCloudTimestamp", () => {
  it("把云端 time 线格式转换为 ISO，失败时原样返回", () => {
    expect(parseCloudTimestamp("2026-09-21 03:43:34.980283 +00:00:00")).toBe(
      "2026-09-21T03:43:34.980Z",
    );
    expect(parseCloudTimestamp(undefined)).toBe(new Date(0).toISOString());
    expect(parseCloudTimestamp("garbage")).toBe("garbage");
  });
});
