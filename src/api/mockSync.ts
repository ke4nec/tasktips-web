import type {
  HistoryEntry,
  ObjectEnvelope,
  PushItemResult,
  PushRequest,
  RestoreInfo,
  SnapshotInfo,
  SyncServerPort,
  Tombstone,
} from "@/sync/protocol";
import { SyncError } from "@/sync/protocol";

interface ServerObject {
  revision: number;
  hash: string;
}

interface ServerTombstone {
  revision: number;
  deletedAt: string;
}

interface ProjectState {
  generation: number;
  objects: Map<string, ServerObject>;
  tombstones: Map<string, ServerTombstone>;
  order: string[];
  requests: Map<string, PushItemResult[]>;
  sequence: number;
  history: HistoryEntry[];
  snapshots: SnapshotRecord[];
  restores: RestoreRecord[];
}

interface SnapshotRecord extends SnapshotInfo {
  objects: [string, ServerObject][];
  tombstones: [string, ServerTombstone][];
  order: string[];
  generation: number;
}

interface RestoreRecord extends RestoreInfo {
  snapshotId?: string;
  sequence?: number;
  polls: number;
  cancelReason?: string;
}

const PAGE_LIMIT_MAX = 500;

const MOCK_SERVER_KEY = "tasktips:mock-server";

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function decodeBase64(text: string): ArrayBuffer {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

// 内存云端：实现 bootstrap/pull/push/幂等/冲突/-generation 语义，
// 供同步引擎先行联调（对照移动端 StubServer 思路）。
// 状态经 localStorage 跨页面加载持久（模拟真实云端；E2E 整页刷新依赖此语义）。
// 清空站点数据即重置。云端真实实现落地后由 HttpSync 替换，引擎代码不变。
export class MockSyncServer implements SyncServerPort {
  private projects = new Map<string, ProjectState>();
  /** 可注入失败：() => 抛错（网络/限流/维护等场景测试）。 */
  failNext: (() => Error) | null = null;
  /** 仅下一次 push 失败（pull 正常通过，用于推送路径测试）。 */
  failPushNext: (() => Error) | null = null;
  /** 强制拒绝指定对象（超限/不支持场景测试）：命中一次后清除。 */
  forceReject: { kind: string; id: string; code: string } | null = null;

  constructor() {
    this.restore();
  }

  private persist() {
    try {
      const projects: Record<string, unknown> = {};
      for (const [pid, state] of this.projects) {
        projects[pid] = {
          generation: state.generation,
          objects: [...state.objects.entries()],
          tombstones: [...state.tombstones.entries()],
          order: state.order,
          requests: [...state.requests.entries()],
          sequence: state.sequence,
          history: state.history,
          snapshots: state.snapshots,
          restores: state.restores,
        };
      }
      const payloads: Record<string, { text?: string; bin?: string }> = {};
      for (const [hash, data] of this.payloads) {
        if (typeof data === "string") {
          payloads[hash] = { text: data };
        } else {
          payloads[hash] = { bin: encodeBase64(data) };
        }
      }
      localStorage.setItem(MOCK_SERVER_KEY, JSON.stringify({ projects, payloads }));
    } catch {
      // 配额不足时退化为纯内存（本次会话仍可用）
    }
  }

  private restore() {
    try {
      const raw = localStorage.getItem(MOCK_SERVER_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        projects?: Record<
          string,
          {
            generation: number;
            objects: [string, ServerObject][];
            tombstones: [string, ServerTombstone][];
            order: string[];
            requests: [string, PushItemResult[]][];
            sequence: number;
            history: HistoryEntry[];
            snapshots: SnapshotRecord[];
            restores: RestoreRecord[];
          }
        >;
        payloads?: Record<string, { text?: string; bin?: string }>;
      };
      if (!parsed || typeof parsed !== "object") return;
      for (const [pid, state] of Object.entries(parsed.projects ?? {})) {
        this.projects.set(pid, {
          generation: state.generation,
          objects: new Map(state.objects),
          tombstones: new Map(state.tombstones),
          order: state.order,
          requests: new Map(state.requests),
          sequence: state.sequence,
          history: state.history,
          snapshots: state.snapshots,
          restores: state.restores,
        });
      }
      for (const [hash, data] of Object.entries(parsed.payloads ?? {})) {
        this.payloads.set(hash, data.text ?? decodeBase64(data.bin ?? ""));
      }
    } catch {
      // 损坏时从空开始
    }
  }

  /** 测试/开发：清空持久化的 Mock 服务端。 */
  reset() {
    this.projects.clear();
    this.payloads.clear();
    try {
      localStorage.removeItem(MOCK_SERVER_KEY);
    } catch {
      // 忽略
    }
  }

  private stateOf(projectId: string): ProjectState {
    let state = this.projects.get(projectId);
    if (!state) {
      state = {
        generation: 1,
        objects: new Map(),
        tombstones: new Map(),
        order: [],
        requests: new Map(),
        sequence: 0,
        history: [],
        snapshots: [],
        restores: [],
      };
      this.projects.set(projectId, state);
    }
    return state;
  }

  private record(
    state: ProjectState,
    kind: HistoryEntry["kind"],
    id: string,
    revision: number,
    hash: string | undefined,
    deleted: boolean,
  ) {
    state.sequence += 1;
    state.history.push({
      sequence: state.sequence,
      kind,
      id,
      revision,
      hash,
      deleted,
      at: new Date().toISOString(),
    });
  }

  private maybeFail() {
    if (this.failNext) {
      const fail = this.failNext;
      this.failNext = null;
      throw fail();
    }
  }

  private key(kind: string, id: string): string {
    return `${kind}/${id}`;
  }

  private page(
    state: ProjectState,
    cursor: string,
    limit: number,
  ): { changes: (ObjectEnvelope | Tombstone)[]; nextCursor: string; done: boolean } {
    const start = cursor === "" ? 0 : Number(cursor);
    if (!Number.isInteger(start) || start < 0 || start > state.order.length) {
      throw new SyncError("CURSOR_INVALID", "同步游标无效，需重新初始化。");
    }
    const slice = state.order.slice(start, start + limit);
    const changes: (ObjectEnvelope | Tombstone)[] = [];
    for (const key of slice) {
      const [kind, id] = key.split("/", 2) as [ObjectEnvelope["kind"], string];
      const tomb = state.tombstones.get(key);
      if (tomb) {
        changes.push({
          kind,
          id,
          revision: tomb.revision,
          deletedAt: tomb.deletedAt,
          projectId: "mock",
        });
      } else {
        const object = state.objects.get(key) as ServerObject;
        changes.push({ kind, id, revision: object.revision, hash: object.hash });
      }
    }
    const next = start + slice.length;
    return { changes, nextCursor: String(next), done: next >= state.order.length };
  }

  async bootstrap(projectId: string, cursor: string, limit: number) {
    this.maybeFail();
    const state = this.stateOf(projectId);
    const { changes, nextCursor, done } = this.page(state, cursor, Math.min(limit, PAGE_LIMIT_MAX));
    return { generation: state.generation, changes, nextCursor, done };
  }

  async pull(projectId: string, cursor: string, limit: number) {
    this.maybeFail();
    const state = this.stateOf(projectId);
    const { changes, nextCursor, done } = this.page(state, cursor, Math.min(limit, PAGE_LIMIT_MAX));
    return { generation: state.generation, changes, nextCursor, done };
  }

  async push(projectId: string, request: PushRequest) {
    this.maybeFail();
    if (this.failPushNext) {
      const fail = this.failPushNext;
      this.failPushNext = null;
      throw fail();
    }
    const state = this.stateOf(projectId);
    // requestId 幂等：原样返回首次结果（§9.1）。
    const seen = state.requests.get(request.requestId);
    if (seen) return { results: seen.map((item) => ({ ...item })) };
    if (request.generation !== state.generation) {
      throw new SyncError("GENERATION_MISMATCH", "服务端代次已变化，需重新初始化。");
    }
    const results: PushItemResult[] = [];
    const forced = this.forceReject;
    this.forceReject = null;
    for (const item of request.objects) {
      const key = this.key(item.kind, item.id);
      if (forced && forced.kind === item.kind && forced.id === item.id) {
        results.push({ kind: item.kind, id: item.id, status: "rejected", code: forced.code });
        continue;
      }
      const current = state.objects.get(key);
      if (current && current.revision !== item.baseRevision) {
        results.push({
          kind: item.kind,
          id: item.id,
          status: "conflict",
          remoteRevision: current.revision,
          remoteHash: current.hash,
        });
        continue;
      }
      const revision = item.baseRevision + 1;
      state.objects.set(key, { revision, hash: item.hash });
      state.tombstones.delete(key);
      if (!state.order.includes(key)) state.order.push(key);
      this.record(state, item.kind, item.id, revision, item.hash, false);
      results.push({
        kind: item.kind,
        id: item.id,
        status: "applied",
        revision,
        remoteHash: item.hash,
      });
    }
    for (const item of request.tombstones) {
      const key = this.key(item.kind, item.id);
      const current = state.objects.get(key);
      if (current && current.revision !== item.baseRevision) {
        results.push({
          kind: item.kind,
          id: item.id,
          status: "conflict",
          remoteRevision: current.revision,
          remoteHash: current.hash,
        });
        continue;
      }
      const revision = item.baseRevision + 1;
      state.objects.delete(key);
      state.tombstones.set(key, { revision, deletedAt: item.deletedAt });
      if (!state.order.includes(key)) state.order.push(key);
      this.record(state, item.kind, item.id, revision, undefined, true);
      results.push({ kind: item.kind, id: item.id, status: "applied", revision });
    }
    state.requests.set(
      request.requestId,
      results.map((item) => ({ ...item })),
    );
    this.persist();
    return { results };
  }

  private payloads = new Map<string, string | ArrayBuffer>();

  async hasPayload(hash: string): Promise<boolean> {
    return this.payloads.has(hash);
  }

  async putPayload(hash: string, data: string | ArrayBuffer, _mediaType?: string): Promise<void> {
    this.payloads.set(hash, data);
    this.persist();
  }

  async getPayload(hash: string): Promise<string | ArrayBuffer | null> {
    return this.payloads.get(hash) ?? null;
  }

  // ---- 测试钩子 ----

  /** 模拟远端直接写入（另一设备提交），推进对象版本。调用方先 putPayload。 */
  remoteWrite(projectId: string, kind: ObjectEnvelope["kind"], id: string, hash: string) {
    const state = this.stateOf(projectId);
    const key = this.key(kind, id);
    const current = state.objects.get(key);
    const revision = (current?.revision ?? 0) + 1;
    state.objects.set(key, { revision, hash });
    if (!state.order.includes(key)) state.order.push(key);
    this.record(state, kind, id, revision, hash, false);
    this.persist();
  }

  /** 模拟远端删除。 */
  remoteDelete(projectId: string, kind: ObjectEnvelope["kind"], id: string) {
    const state = this.stateOf(projectId);
    const key = this.key(kind, id);
    const current = state.objects.get(key);
    const revision = (current?.revision ?? 0) + 1;
    state.objects.delete(key);
    state.tombstones.set(key, { revision, deletedAt: new Date().toISOString() });
    if (!state.order.includes(key)) state.order.push(key);
    this.record(state, kind, id, revision, undefined, true);
    this.persist();
  }

  /** 模拟云端恢复：代次变化，旧游标与请求上下文废弃（§9.2）。 */
  bumpGeneration(projectId: string) {
    this.stateOf(projectId).generation += 1;
    this.persist();
  }

  // ---- 历史（§10.1）：分页只加载信封，payload 按需下载 ----

  async history(projectId: string, afterSequence: number | null, limit: number) {
    const state = this.stateOf(projectId);
    const entries = state.history
      .filter((entry) => (afterSequence ?? 0) < entry.sequence)
      .slice(0, limit);
    const last = entries[entries.length - 1];
    return {
      entries,
      nextSequence: last && last.sequence < state.sequence ? last.sequence : null,
    };
  }

  async objectHistory(
    projectId: string,
    kind: ObjectEnvelope["kind"],
    id: string,
    afterSequence: number | null,
    limit: number,
  ) {
    const state = this.stateOf(projectId);
    const entries = state.history
      .filter(
        (entry) => entry.kind === kind && entry.id === id && (afterSequence ?? 0) < entry.sequence,
      )
      .slice(0, limit);
    const scoped = state.history.filter((entry) => entry.kind === kind && entry.id === id);
    const last = entries[entries.length - 1];
    return {
      entries,
      nextSequence:
        last && scoped.length > 0 && last.sequence < scoped[scoped.length - 1].sequence
          ? last.sequence
          : null,
    };
  }

  // ---- 快照与恢复任务（§10.1） ----

  async listSnapshots(projectId: string): Promise<SnapshotInfo[]> {
    const state = this.stateOf(projectId);
    return [...state.snapshots]
      .reverse()
      .map(
        ({
          objects: _objects,
          tombstones: _tombstones,
          order: _order,
          generation: _generation,
          ...info
        }) => info,
      );
  }

  async createSnapshot(projectId: string, label: string): Promise<SnapshotInfo> {
    const state = this.stateOf(projectId);
    const snapshot: SnapshotRecord = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      changeSequence: state.sequence,
      status: "ready",
      label: label || "手动快照",
      createdAt: new Date().toISOString(),
      objects: [...state.objects.entries()],
      tombstones: [...state.tombstones.entries()],
      order: [...state.order],
      generation: state.generation,
    };
    state.snapshots.push(snapshot);
    this.persist();
    const { objects: _o, tombstones: _t, order: _r, generation: _g, ...info } = snapshot;
    return info;
  }

  async createRestore(
    projectId: string,
    input: { snapshotId?: string; sequence?: number; reason: string },
  ): Promise<RestoreInfo> {
    const state = this.stateOf(projectId);
    const reason = input.reason.trim();
    if (reason.length < 1 || [...reason].length > 512) {
      throw new SyncError("VALIDATION_ERROR", "恢复原因必填，1–512 字符。");
    }
    const snapshot = input.snapshotId
      ? state.snapshots.find((item) => item.id === input.snapshotId)
      : undefined;
    if (input.snapshotId && !snapshot) {
      throw new SyncError("NOT_FOUND", "快照不存在。");
    }
    if (snapshot && snapshot.status !== "ready") {
      throw new SyncError("SERVER_ERROR", "快照不可恢复。");
    }
    const restore: RestoreRecord = {
      id: `restore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "pending",
      reason,
      createdAt: new Date().toISOString(),
      snapshotId: input.snapshotId,
      sequence: input.sequence,
      polls: 0,
    };
    state.restores.push(restore);
    this.persist();
    const { snapshotId: _s, sequence: _q, polls: _p, cancelReason: _c, ...info } = restore;
    return info;
  }

  async getRestore(projectId: string, id: string): Promise<RestoreInfo> {
    const state = this.stateOf(projectId);
    const restore = state.restores.find((item) => item.id === id);
    if (!restore) throw new SyncError("NOT_FOUND", "恢复任务不存在。");
    if (restore.status === "pending") {
      restore.polls += 1;
      if (restore.polls >= 2) {
        // 两次轮询后完成：整个项目恢复到快照并推进代次（§10.1）。
        const snapshot = state.snapshots.find((item) => item.id === restore.snapshotId);
        if (snapshot) {
          state.objects = new Map(snapshot.objects);
          state.tombstones = new Map(snapshot.tombstones);
          state.order = [...snapshot.order];
        }
        state.generation += 1;
        restore.status = "ready";
        this.persist();
      }
    }
    const { snapshotId: _s, sequence: _q, polls: _p, cancelReason: _c, ...info } = restore;
    return info;
  }

  async cancelRestore(projectId: string, id: string, reason: string): Promise<RestoreInfo> {
    const state = this.stateOf(projectId);
    const restore = state.restores.find((item) => item.id === id);
    if (!restore) throw new SyncError("NOT_FOUND", "恢复任务不存在。");
    if (!reason.trim()) {
      throw new SyncError("VALIDATION_ERROR", "取消原因必填。");
    }
    if (restore.status === "pending") restore.status = "cancelled";
    restore.cancelReason = reason.trim();
    this.persist();
    const { snapshotId: _s, sequence: _q, polls: _p, cancelReason: _c, ...info } = restore;
    return info;
  }

  inspect(projectId: string): { generation: number; objects: number; requests: number } {
    const state = this.stateOf(projectId);
    return {
      generation: state.generation,
      objects: state.objects.size,
      requests: state.requests.size,
    };
  }
}
