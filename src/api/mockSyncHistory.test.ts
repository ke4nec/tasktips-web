import { describe, expect, it } from "vitest";

import { MockSyncServer } from "@/api/mockSync";

describe("历史快照恢复（Mock）", () => {
  it("历史分页只给信封", async () => {
    const server = new MockSyncServer();
    server.remoteWrite("demo", "todo", "t-1", "h1");
    await server.putPayload("h1", "payload-1");
    server.remoteWrite("demo", "todo", "t-1", "h2");
    await server.putPayload("h2", "payload-2");
    const first = await server.history("demo", null, 1);
    expect(first.entries).toHaveLength(1);
    expect(first.entries[0]).toMatchObject({ kind: "todo", id: "t-1" });
    expect(first.nextSequence).toBe(1);
    const second = await server.history("demo", first.nextSequence, 10);
    expect(second.entries).toHaveLength(1);
    expect(second.nextSequence).toBeNull();
    const scoped = await server.objectHistory("demo", "todo", "t-1", null, 10);
    expect(scoped.entries).toHaveLength(2);
  });

  it("快照创建与恢复任务轮询", async () => {
    const server = new MockSyncServer();
    server.remoteWrite("demo", "todo", "t-1", "h1");
    const snapshot = await server.createSnapshot("demo", "发布前");
    expect(snapshot.status).toBe("ready");
    expect((await server.listSnapshots("demo")).map((item) => item.id)).toContain(snapshot.id);

    await expect(
      server.createRestore("demo", { snapshotId: snapshot.id, reason: "   " }),
    ).rejects.toThrow("1–512");
    await expect(
      server.createRestore("demo", { snapshotId: "nope", reason: "回滚" }),
    ).rejects.toThrow("快照不存在");

    let restore = await server.createRestore("demo", { snapshotId: snapshot.id, reason: "回滚" });
    expect(restore.status).toBe("pending");
    restore = await server.getRestore("demo", restore.id);
    expect(restore.status).toBe("pending");
    restore = await server.getRestore("demo", restore.id);
    expect(restore.status).toBe("ready");

    // 取消已完成任务保持终态
    const cancelled = await server.cancelRestore("demo", restore.id, "不需要了");
    expect(cancelled.status).toBe("ready");
  });

  it("取消pending任务需原因", async () => {
    const server = new MockSyncServer();
    const snapshot = await server.createSnapshot("demo", "");
    const restore = await server.createRestore("demo", {
      snapshotId: snapshot.id,
      reason: "误操作",
    });
    await expect(server.cancelRestore("demo", restore.id, "  ")).rejects.toThrow("取消原因");
    const cancelled = await server.cancelRestore("demo", restore.id, "误操作，撤回");
    expect(cancelled.status).toBe("cancelled");
  });
});
