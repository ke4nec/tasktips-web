import { defineStore } from "pinia";
import { ref } from "vue";

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
  if (import.meta.env.VITE_API_MODE !== "http") return mockSyncServer;
  const session = useSessionStore();
  return new HttpSyncServer({
    projectId,
    getToken: () => session.accessToken ?? null,
    deviceId: () => session.deviceId ?? "web",
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
      engine = new SyncEngine({
        content,
        server: syncServerFor(projectId),
        deviceId: () => session.deviceId ?? "web",
        projectId,
        userId: session.account?.email ?? "local",
        refreshSession: () => session.refreshAccess(),
        online: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
      });
      engines.set(scope, engine);
    }
    return engine;
  }

  async function refresh(projectId: string = currentProjectId.value) {
    if (!projectId) return;
    const engine = getEngine(projectId);
    const state = await engine.getState();
    // 引擎状态为裸对象：浅拷贝后赋值，否则同引用不触发模板更新。
    detail.value = { ...state };
    pendingCount.value = state.pending
      ? state.pending.objects.length + state.pending.tombstones.length
      : 0;
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
      status.value = "synced";
    }
  }

  async function reloadContent(projectId: string) {
    const todos = useTodoStore();
    const classification = useClassificationStore();
    await Promise.all([todos.load(projectId), classification.load(projectId)]);
  }

  async function syncNowManual(projectId: string = currentProjectId.value) {
    if (!projectId || syncing.value) return;
    syncing.value = true;
    status.value = "syncing";
    try {
      await getEngine(projectId).syncNow({ manual: true });
      await reloadContent(projectId);
    } finally {
      syncing.value = false;
      await refresh(projectId);
    }
  }

  async function ensureProject(projectId: string) {
    currentProjectId.value = projectId;
    wireGlobal();
    await refresh(projectId);
    // 启动与项目进入时触发自动同步（§9.3），不阻塞界面。
    const engine = getEngine(projectId);
    const state = await engine.getState();
    if (state.autoSync) {
      syncing.value = true;
      try {
        await engine.syncNow();
        await reloadContent(projectId);
      } finally {
        syncing.value = false;
        await refresh(projectId);
      }
    }
  }

  function notifyDirty(projectId: string = currentProjectId.value) {
    if (!projectId) return;
    status.value = "pending";
    // 本地保存后触发自动同步（§9.3），合并为单飞任务；关闭时仅标记待同步。
    if (detail.value && !detail.value.autoSync) return;
    void getEngine(projectId)
      .syncNow()
      .then(() => reloadContent(projectId))
      .then(() => refresh(projectId))
      .catch(() => refresh(projectId));
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
        void reloadContent(currentProjectId.value).then(() => refresh(currentProjectId.value));
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
    ensureProject,
    syncNowManual,
    notifyDirty,
    setAutoSync,
    resolveConflict,
    refresh,
    getEngine,
  };
});

export type { ConflictRecord, SyncLogEntry };
