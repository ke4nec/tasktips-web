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
    const request = vi.fn(async () => false);
    vi.stubGlobal("navigator", { locks: { request } });
    await expect(tryAcquireTaskLock("p", "t")).resolves.toBeNull();
    expect(request).toHaveBeenCalledOnce();
  });

  it("获取成功返回释放函数", async () => {
    let releaseInner: (() => void) | null = null;
    const request = vi.fn(
      async (_name: string, _opts: object, callback: () => Promise<boolean>) => {
        const holding = callback();
        releaseInner = () => void holding;
        return true;
      },
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const release = await tryAcquireTaskLock("p", "t");
    expect(release).not.toBeNull();
    expect(releaseInner).not.toBeNull();
    release?.();
  });
});
