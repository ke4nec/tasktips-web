import { afterEach, describe, expect, it, vi } from "vitest";

import { tryAcquireTaskLock } from "@/sync/locks";

describe("任务编辑会话锁", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("无 Web Locks 能力时视为可编辑", async () => {
    vi.stubGlobal("navigator", {});
    const release = await tryAcquireTaskLock("p", "t");
    expect(release).not.toBeNull();
    release?.();
  });

  it("锁被占用时返回 null（只读）", async () => {
    const request = vi.fn(
      async (_name: string, _opts: object, callback: (lock: Lock | null) => unknown) =>
        callback(null),
    );
    vi.stubGlobal("navigator", { locks: { request } });
    await expect(tryAcquireTaskLock("p", "t")).resolves.toBeNull();
    expect(request).toHaveBeenCalledOnce();
  });

  it("获取成功返回释放函数", async () => {
    let holding: Promise<unknown> | null = null;
    const request = vi.fn(
      async (_name: string, _opts: object, callback: (lock: Lock | null) => unknown) => {
        holding = callback({} as Lock) as Promise<unknown>;
        return holding;
      },
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const release = await tryAcquireTaskLock("p", "t");
    expect(release).not.toBeNull();
    expect(holding).not.toBeNull();
    release?.();
    await holding;
  });
});
