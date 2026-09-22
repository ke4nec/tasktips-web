// 任务编辑会话锁（设计文档 §9.3）：同任务跨标签页互斥，另一持有者打开时只读。
// 返回持有释放函数；拿不到锁返回 null。Web Locks 不可用时视为可编辑
// （无法协调，不伪装可靠锁；工作区准入另行做能力检测）。
// 注意：ifAvailable 与 signal 不可同用，持有期释放由调用方在卸载时显式调用。
export async function tryAcquireTaskLock(
  projectId: string,
  todoId: string,
): Promise<(() => void) | null> {
  const locks =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;
  if (!locks) return () => undefined;
  return new Promise<(() => void) | null>((resolve) => {
    let settled = false;
    void locks
      .request(`tasktips-task:${projectId}:${todoId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          settled = true;
          resolve(null);
          return false;
        }

        let released = false;
        let releaseHeldLock = () => undefined;
        const held = new Promise<boolean>((resolveHeld) => {
          releaseHeldLock = () => {
            if (released) return;
            released = true;
            resolveHeld(true);
          };
        });
        settled = true;
        resolve(() => releaseHeldLock());
        return held;
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      });
  });
}
