import { DexieContent } from "./dexie";
import { useSessionStore } from "@/stores/session";

// 内容仓储单例：Dexie（IndexedDB）实现，按 userId+projectId 命名空间隔离（§7.2）。
// P6 在此叠加同步引擎，store 层接口保持不变。
export const content = new DexieContent(() => {
  try {
    return useSessionStore().account?.email ?? "local";
  } catch {
    return "local";
  }
});
