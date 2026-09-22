import { defineStore } from "pinia";
import { ref } from "vue";

import { HTTP_API_MODE } from "@/api/mode";
import { HttpSyncServer } from "@/api/httpSync";
import { MockSyncServer } from "@/api/mockSync";
import { content } from "@/content";
import { sha256Hex } from "@/sync/serialize";
import { subscribeInvalidation, SyncEngine } from "@/sync/engine";
import type { ConflictRecord, SyncLogEntry, SyncStateData } from "@/sync/state";
import type { SyncServerPort } from "@/sync/protocol";
import { useClassificationStore } from "@/stores/classification";
import { useSessionStore } from "@/stores/session";
import { useTodoStore } from "@/stores/todos";

// Mock 同步服务端（Mock 模式共享单例；测试钩子 remoteWrite/bumpGeneration 挂在它上面）。
export const mockSyncServer = new MockSyncServer();

// 按模式选择同步服务端：VITE_API_MODE=http 时走真实云端
// （引擎与页面统一从这里取，SyncServerPort 两个实现可互换）。
export function syncServerFor(projectId: string): SyncServerPort {
  if (!HTTP_API_MODE) return mockSyncServer;
  const session = useSessionStore();
  const email = session.account?.email;
  const deviceId = session.deviceId ?? "web";
  return new HttpSyncServer({
    projectId,
    getToken: () => {
      if (session.account?.email !== email) throw new Error("同步账号已变化。");
      return session.accessToken ?? null;
    },
    deviceId: () => deviceId,
  });
}

export type UiSyncStatus =
  | "synced"
  | "pending"
  | "syncing"
  | "conflict"
  | "partial"
  | "offline"
  | "paused"
  | "auth"
  | "maintenance"
  | "error"
  | "idle";

let globalWired = false;

// 同步门面（设计文档 §9.3）：项目单飞任务、自动触发、跨标签页失效重载。
export const useSyncStore = defineStore("sync", () => {
  const engines = new Map<string, SyncEngine>();
  const currentProjectId = ref("");
  const status = ref<UiSyncStatus>("idle");
  const syncing = ref(false);
  const detail = ref<SyncStateData | null>(null);
  const pendingCount = ref(0);

  function scopeOf(projectId: string): string {
    const session = useSessionStore();
    return `${session.account?.email ?? "local"}\n${projectId}`;
  }

  function getEngine(projectId: string): SyncEngine {
    const scope = scopeOf(projectId);
    let engine = engines.get(scope);
    if (!engine) {
      const session = useSessionStore();
      const email = session.account?.email ?? "local";
      const deviceId = session.deviceId ?? "web";
      engine = new SyncEngine({
        content,
        server: syncServerFor(projectId),
        deviceId: () => deviceId,
        projectId,
        userId: email,
        refreshSession: () =>
          (session.account?.email ?? "local") === email
            ? session.refreshAccess()
            : Promise.resolve(false),
        online: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
      });
      engines.set(scope, engine);
    }
    return engine;
  }

  function isActiveEngine(projectId: string, engine: SyncEngine) {
    return engines.get(scopeOf(projectId)) === engine;
  }

  async function refresh(projectId: string = currentProjectId.value) {
    if (!projectId) return;
    const scope = scopeOf(projectId);
    const engine = getEngine(projectId);
    const state = await engine.getState();
    if (!isActiveEngine(projectId, engine)) return;
    const count = await engine.getPendingCount();
    if (
      scope !== scopeOf(projectId) ||
      (currentProjectId.value && projectId !== currentProjectId.value)
    )
      return;
    // 引擎状态为裸对象：浅拷贝后赋值，否则同引用不触发模板更新。
    detail.value = { ...state };
    pendingCount.value = count;
    if (syncing.value) {
      status.value = "syncing";
    } else if (state.conflicts.length > 0) {
      status.value = "conflict";
    } else if (state.rejected.length > 0) {
      status.value = "partial";
    } else if (state.submitPaused) {
      status.value = state.lastError === "PROJECT_MAINTENANCE" ? "maintenance" : "paused";
    } else if (state.lastError === "AUTHENTICATION_REQUIRED") {
      status.value = "auth";
    } else if (state.lastError) {
      status.value = "error";
    } else if (typeof navigator !== "undefined" && navigator.onLine === false) {
      status.value = "offline";
    } else {
      status.value = count > 0 ? "pending" : "synced";
    }
  }

  async function logoutPendingCount(): Promise<number> {
    const projects = await content.listLocalProjects();
    let count = 0;
    for (const id of projects) count += await getEngine(id).getPendingCount();
    return count;
  }

  async function reloadContent(projectId: string) {
    if (projectId !== currentProjectId.value || !useSessionStore().account) return;
    const todos = useTodoStore();
    const classification = useClassificationStore();
    await Promise.all([todos.load(projectId), classification.load(projectId)]);
  }

  async function syncNowManual(
    projectId: string = currentProjectId.value,
    options: { requireSuccess?: boolean } = {},
  ) {
    if (!projectId) return "idle";
    if (syncing.value) {
      if (options.requireSuccess) throw new Error("同步正在进行，请稍后再退出。");
      return "busy";
    }
    const engine = getEngine(projectId);
    syncing.value = true;
    status.value = "syncing";
    try {
      const result = await engine.syncNow({ manual: true });
      if (isActiveEngine(projectId, engine)) await reloadContent(projectId);
      if (options.requireSuccess && result !== "synced") {
        throw new Error(
          result === "conflict"
            ? "同步发现冲突，请先处理冲突后再退出。"
            : "退出前同步未完成，请检查网络后重试。",
        );
      }
      return result;
    } finally {
      if (isActiveEngine(projectId, engine)) {
        syncing.value = false;
        await refresh(projectId);
      }
    }
  }

  function resetProject(projectId: string) {
    const scope = scopeOf(projectId);
    engines.get(scope)?.invalidate();
    engines.delete(scope);
    if (currentProjectId.value === projectId) {
      status.value = "idle";
      syncing.value = false;
      detail.value = null;
      pendingCount.value = 0;
    }
  }

  function resetContext() {
    for (const engine of engines.values()) engine.invalidate();
    engines.clear();
    currentProjectId.value = "";
    status.value = "idle";
    syncing.value = false;
    detail.value = null;
    pendingCount.value = 0;
  }

  async function ensureProject(projectId: string) {
    currentProjectId.value = projectId;
    wireGlobal();
    const engine = getEngine(projectId);
    await refresh(projectId);
    if (!isActiveEngine(projectId, engine) || currentProjectId.value !== projectId) return;
    // 启动与项目进入时触发自动同步（§9.3），不阻塞界面。
    const state = await engine.getState();
    if (state.autoSync) {
      syncing.value = true;
      try {
        await engine.syncNow();
        if (isActiveEngine(projectId, engine)) await reloadContent(projectId);
      } finally {
        if (isActiveEngine(projectId, engine) && currentProjectId.value === projectId) {
          syncing.value = false;
          await refresh(projectId);
        }
      }
    }
  }

  function notifyDirty(projectId: string = currentProjectId.value) {
    if (!projectId) return;
    status.value = "pending";
    // 本地保存后触发自动同步（§9.3），合并为单飞任务；关闭时仅标记待同步。
    if (detail.value && !detail.value.autoSync) {
      void refresh(projectId).catch(() => undefined);
      return;
    }
    const engine = getEngine(projectId);
    void engine
      .syncNow()
      .then(async () => {
        if (!isActiveEngine(projectId, engine)) return;
        await reloadContent(projectId);
        await refresh(projectId);
      })
      .catch(() => undefined);
  }

  async function setAutoSync(projectId: string, enabled: boolean) {
    await getEngine(projectId).setAutoSync(enabled);
    await refresh(projectId);
  }

  async function resolveConflict(
    projectId: string,
    conflict: ConflictRecord,
    keep: "local" | "remote",
  ): Promise<boolean> {
    const engine = getEngine(projectId);
    // 决定前重新校验双方版本；变化则返回 false 由 UI 刷新比较（§9.2）。
    if (!(await engine.revalidate(conflict.kind, conflict.id))) return false;
    // 任一版本决定前保留恢复副本（§9.2）。
    await content.stashRecovery(projectId, `冲突解决前（${conflict.kind}/${conflict.id}）`);
    if (keep === "local") await engine.resolveKeepLocal(conflict.kind, conflict.id);
    else await engine.resolveUseRemote(conflict.kind, conflict.id);
    await reloadContent(projectId);
    await refresh(projectId);
    return true;
  }

  function wireGlobal() {
    if (globalWired) return;
    globalWired = true;
    subscribeInvalidation((scope) => {
      // 其他标签页的变更：重载当前项目内容（§9.3 只收标识）。
      const session = useSessionStore();
      const current = `${session.account?.email ?? "local"}\n${currentProjectId.value}`;
      if (scope === current && currentProjectId.value) {
        void reloadContent(currentProjectId.value)
          .then(() => refresh(currentProjectId.value))
          .catch(() => undefined);
      }
    });
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        if (currentProjectId.value) void getEngine(currentProjectId.value).syncNow();
      });
      document.addEventListener("visibilitychange", () => {
        // 恢复前台时检查同步（§9.3）。
        if (document.visibilityState === "visible" && currentProjectId.value) {
          void getEngine(currentProjectId.value).syncNow();
        }
      });
      window.addEventListener("tasktips:session-reset", resetContext);
      // 前台每 60 秒检查（§9.3）。
      setInterval(() => {
        if (document.visibilityState === "visible" && currentProjectId.value) {
          void getEngine(currentProjectId.value)
            .syncNow()
            .then(() => refresh(currentProjectId.value))
            .catch(() => undefined);
        }
      }, 60_000);
    }
  }

  // E2E 钩子（仅开发模式）：模拟另一设备提交，驱动冲突与恢复流程用例。
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as { __sync_debug?: object }).__sync_debug = {
      remoteWriteTodo: async (projectId: string, id: string, body: string) => {
        const payload = `---\nid: ${id}\ntitle: 远端\nstatus: open\npriority: 0\ntags:\ncreatedAt: 2026-09-01T00:00:00.000Z\nupdatedAt: 2026-09-02T00:00:00.000Z\nrevision: 9\ndeviceId: dev-2\nschemaVersion: 1\n---\n${body}\n`;
        const hash = await sha256Hex(payload);
        await mockSyncServer.putPayload(hash, payload);
        mockSyncServer.remoteWrite(projectId, "todo", id, hash);
      },
    };
  }

  return {
    currentProjectId,
    status,
    syncing,
    detail,
    pendingCount,
    logoutPendingCount,
    ensureProject,
    syncNowManual,
    notifyDirty,
    setAutoSync,
    resolveConflict,
    refresh,
    getEngine,
    resetProject,
    resetContext,
  };
});

export type { ConflictRecord, SyncLogEntry };
