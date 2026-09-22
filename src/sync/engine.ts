import type { ContentPort } from "@/content/port";
import { deriveTitle } from "@/domain/title";
import type { Category, Tag, Todo } from "@/domain/types";
import {
  parseIndex,
  parseTodoDoc,
  serializeClassification,
  serializeIndex,
  serializeTodo,
  sha256Hex,
  todoFromDoc,
  type IndexData,
} from "./serialize";
import {
  initialSyncState,
  type PendingObject,
  type PendingPush,
  type PendingTombstone,
  type SyncStateData,
} from "@/sync/state";
import {
  changeKey,
  isTerminalSyncAuth,
  isTombstone,
  SyncError,
  type ObjectEnvelope,
  type PushItemResult,
  type PushRequest,
  type SyncKind,
  type SyncServerPort,
  type Tombstone,
} from "@/sync/protocol";

export interface EngineDeps {
  content: ContentPort;
  server: SyncServerPort;
  deviceId: () => string;
  projectId: string;
  userId: string;
  /** 401 后刷新一次会话，返回是否恢复。Mock 下恒为 false。 */
  refreshSession?: () => Promise<boolean>;
  online?: () => boolean;
  randomId?: () => string;
}

const PULL_LIMIT = 500;
const PUSH_BATCH = 100;
const BACKOFF_STEPS = [30_000, 60_000, 120_000, 300_000];

type RawLocal = { raw: string; revision: number; seeded?: boolean };
type LocalSyncValue = Todo | RawLocal | Blob;

function newRequestId(randomId: () => string): string {
  return `push-${Date.now()}-${randomId()}`;
}

// 同步引擎（设计文档 §9）：bootstrap/pull/push、幂等请求、逐项确认、
// generation 变化重初始化。远端基线独立保存，不用本地 revision 推断。
export class SyncEngine {
  private state: SyncStateData | null = null;
  private running: Promise<string> | null = null;
  private epoch = 0;

  constructor(private readonly deps: EngineDeps) {}

  get scope(): string {
    return `${this.deps.userId}\n${this.deps.projectId}`;
  }

  /** 登出/切换账号时递增，旧响应不得写入新上下文（§8.3）。 */
  invalidate() {
    this.epoch += 1;
  }

  private async loadState(): Promise<SyncStateData> {
    if (!this.state) {
      const raw = await this.deps.content.getSyncState(this.deps.projectId);
      this.state = raw ? (JSON.parse(raw) as SyncStateData) : initialSyncState();
    }
    return this.state;
  }

  private async saveState(): Promise<void> {
    if (!this.state) return;
    await this.deps.content.putSyncState(this.deps.projectId, JSON.stringify(this.state));
  }

  private log(
    direction: "pull" | "push" | "bootstrap",
    count: number,
    code?: string,
    requestId?: string,
  ) {
    if (!this.state) return;
    this.state.logs.unshift({
      at: new Date().toISOString(),
      direction,
      count,
      code,
      requestId,
    });
    this.state.logs = this.state.logs.slice(0, 200);
  }

  // ---- 主流程（项目单飞任务，§9.3） ----

  async syncNow(options?: { manual?: boolean }): Promise<string> {
    if (this.running) return this.running;
    this.running = this.run(options?.manual ?? false).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async withLock<T>(task: () => Promise<T>): Promise<T> {
    // 账号项目级同步锁；无 Web Locks 能力时直接执行（工作区准入另行判断）。
    const locks =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { locks?: LockManager }).locks
        : undefined;
    if (locks) {
      return locks.request(`tasktips-sync:${this.scope}`, async () => task());
    }
    return task();
  }

  private async run(manual: boolean): Promise<string> {
    const epoch = this.epoch;
    return this.withLock(async () => {
      const state = await this.loadState();
      if (epoch !== this.epoch) return "error";
      if (!this.isOnline()) {
        return "offline";
      }
      if (!manual && Date.now() < state.backoffUntil) {
        return this.describe(state);
      }
      if (!manual && state.submitPaused) {
        return this.describe(state);
      }
      if (!manual && !state.autoSync) {
        return this.describe(state);
      }
      try {
        if (!state.bootstrapped) {
          await this.bootstrap(state, epoch);
        } else {
          await this.pull(state, epoch);
        }
        if (epoch !== this.epoch) return "error";
        await this.pushDirty(state, epoch, manual);
        state.lastSyncAt = new Date().toISOString();
        state.lastError = null;
        state.backoffUntil = 0;
        state.backoffStep = 0;
        // 成功即恢复提交（维护后手动重试可解除暂停；终局认证失败不可能成功）。
        state.submitPaused = false;
        this.log("push", 0);
        await this.saveState();
        notifyScope(this.scope);
        return this.describe(state);
      } catch (error) {
        return this.handleFailure(state, error, manual);
      }
    });
  }

  private isOnline(): boolean {
    if (this.deps.online) return this.deps.online();
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  private describe(state: SyncStateData): string {
    if (state.conflicts.length > 0) return "conflict";
    if (state.rejected.length > 0) return "partial";
    if (state.submitPaused) {
      return state.lastError === "PROJECT_MAINTENANCE" ? "maintenance" : "auth";
    }
    if (state.lastError) return "error";
    return "synced";
  }

  private async handleFailure(
    state: SyncStateData,
    error: unknown,
    manual: boolean,
  ): Promise<string> {
    if (
      error instanceof SyncError &&
      (error.code === "GENERATION_MISMATCH" || error.code === "CURSOR_INVALID")
    ) {
      // 停止旧请求，保存本机内容，废弃旧游标与请求上下文并重新 bootstrap（§9.2）。
      state.bootstrapped = false;
      state.cursor = null;
      state.generation = 0;
      state.pending = null;
      state.lastError = error.code;
      await this.saveState();
      if (!manual) {
        // 自动流程内直接重初始化一次；手动流程由调用方决定。
        return this.run(true);
      }
      return "error";
    }
    if (error instanceof SyncError && isTerminalSyncAuth(error.code)) {
      state.lastError = error.code;
      state.submitPaused = true;
      this.log("push", 0, error.code);
      await this.saveState();
      return "auth";
    }
    if (error instanceof SyncError && error.code === "PROJECT_MAINTENANCE") {
      state.lastError = error.code;
      state.submitPaused = true;
      this.log("push", 0, error.code);
      await this.saveState();
      return "maintenance";
    }
    if (error instanceof SyncError && error.code === "AUTHENTICATION_REQUIRED") {
      if (this.deps.refreshSession && (await this.deps.refreshSession())) {
        return this.run(true);
      }
      state.lastError = error.code;
      this.log("push", 0, error.code);
      await this.saveState();
      return "auth";
    }
    const code = error instanceof SyncError ? error.code : "SERVER_ERROR";
    state.lastError = code;
    this.log("push", 0, code);
    if (!manual) {
      const step = Math.min(state.backoffStep, BACKOFF_STEPS.length - 1);
      state.backoffUntil = Date.now() + BACKOFF_STEPS[step];
      state.backoffStep += 1;
    }
    await this.saveState();
    return "error";
  }

  // ---- 初始化与增量 ----

  private async bootstrap(state: SyncStateData, epoch: number): Promise<void> {
    // 暂存快照：全部分片可靠落库后，才启用返回的 cursor（§9.1）。
    let cursor = "";
    let generation = 0;
    let pages = 0;
    for (;;) {
      const page = await this.deps.server.bootstrap(this.deps.projectId, cursor, PULL_LIMIT);
      if (pages === 0) generation = page.generation;
      if (page.generation !== generation) {
        throw new SyncError("GENERATION_MISMATCH", "初始化中代次变化。");
      }
      await this.applyPage(state, page.changes, epoch, true);
      cursor = page.nextCursor;
      pages += 1;
      if (page.done) break;
    }
    state.generation = generation;
    state.cursor = cursor;
    state.bootstrapped = true;
    this.log("bootstrap", pages);
    await this.saveState();
  }

  private async pull(state: SyncStateData, epoch: number): Promise<void> {
    let cursor = state.cursor ?? "";
    for (;;) {
      const page = await this.deps.server.pull(this.deps.projectId, cursor, PULL_LIMIT);
      if (page.generation !== state.generation) {
        throw new SyncError("GENERATION_MISMATCH", "增量中代次变化。");
      }
      // 先下载、校验并保存，再推进该页 cursor（§9.1）。
      await this.applyPage(state, page.changes, epoch, false);
      cursor = page.nextCursor;
      state.cursor = cursor;
      await this.saveState();
      if (page.done) break;
    }
    this.log("pull", 0);
  }

  private async applyPage(
    state: SyncStateData,
    changes: (ObjectEnvelope | Tombstone)[],
    epoch: number,
    isBootstrap: boolean,
  ): Promise<void> {
    // 预下载全部 payload 并校验哈希，任一失败则整页回滚、不推进游标。
    const payloads = new Map<string, string | ArrayBuffer>();
    for (const change of changes) {
      if (epoch !== this.epoch) throw new SyncError("SERVER_ERROR", "上下文已失效。");
      if (isTombstone(change)) continue;
      const data = await this.deps.server.getPayload(change.hash);
      if (data === null) {
        throw new SyncError("HASH_MISMATCH", `对象 ${change.kind}/${change.id} 缺少 payload。`);
      }
      const actual = await sha256Hex(data);
      if (actual !== change.hash) {
        throw new SyncError("HASH_MISMATCH", `对象 ${change.kind}/${change.id} 哈希不一致。`);
      }
      payloads.set(changeKey(change), data);
    }
    // 本页任务一次读出，逐项比对不再全表扫描（大列表性能）。
    const todoMap = new Map(
      (await this.deps.content.listTodos(this.deps.projectId)).map((todo) => [todo.id, todo]),
    );
    for (const change of changes) {
      if (isTombstone(change)) {
        await this.applyTombstone(state, change, todoMap);
      } else {
        const data = payloads.get(changeKey(change)) as string | ArrayBuffer;
        await this.applyObject(state, change, data, isBootstrap, todoMap);
      }
    }
    await this.saveState();
  }

  private async applyObject(
    state: SyncStateData,
    envelope: ObjectEnvelope,
    data: string | ArrayBuffer,
    isBootstrap: boolean,
    todoMap: Map<string, Todo>,
  ): Promise<void> {
    const key = changeKey(envelope);
    const base = state.baselines[key];
    const raw = await this.readLocal(envelope.kind, envelope.id, todoMap, state);
    // 演示种子非用户意图：无基线时视为缺席，直接采用远端（§7.2 种子仅为本地演示）。
    const local = raw !== null && "seeded" in raw && raw.seeded === true && !base ? null : raw;
    const localHash = local ? await this.hashLocal(envelope.kind, local) : null;
    const dirty =
      local !== null &&
      (!base ||
        localHash !== base.hash ||
        (envelope.kind === "todo" && this.localRevision(envelope.kind, local) > base.revision));

    // 回收站本地保留：远端变更不复活已删除任务，仅跟进基线（P6 边界）。
    if (envelope.kind === "todo" && local !== null && (local as Todo).deletedAt) {
      state.baselines[key] = { revision: envelope.revision, hash: envelope.hash };
      return;
    }
    if (!base && !dirty) {
      // 新对象直接落地。
      await this.writeLocal(envelope.kind, envelope.id, data, envelope.revision);
      state.baselines[key] = { revision: envelope.revision, hash: envelope.hash };
      this.clearIssue(state, key);
      return;
    }
    if (base && base.revision === envelope.revision && base.hash === envelope.hash) {
      return; // 已确认
    }
    if (dirty) {
      // 整对象冲突，不自动合并、不最后写入覆盖（§9.2）。
      this.upsertConflict(state, {
        kind: envelope.kind,
        id: envelope.id,
        localRevision: base?.revision ?? 0,
        localHash: localHash ?? undefined,
        remoteRevision: envelope.revision,
        remoteHash: envelope.hash,
        remoteDeleted: false,
        detectedAt: new Date().toISOString(),
      });
      return;
    }
    // 复活守卫：已确认的远端删除不因缺失重建（墓碑可靠性由 confirmed 保证）。
    const confirmed = state.baselines[`${key}:deleted`];
    if (confirmed && confirmed.revision >= envelope.revision && !isBootstrap) {
      state.baselines[key] = { revision: envelope.revision, hash: envelope.hash };
      return;
    }
    await this.writeLocal(envelope.kind, envelope.id, data, envelope.revision);
    state.baselines[key] = { revision: envelope.revision, hash: envelope.hash };
    this.clearIssue(state, key);
  }

  private async applyTombstone(
    state: SyncStateData,
    tomb: Tombstone,
    todoMap: Map<string, Todo>,
  ): Promise<void> {
    const key = `${tomb.kind}/${tomb.id}`;
    const base = state.baselines[key];
    const raw = await this.readLocal(tomb.kind, tomb.id, todoMap, state);
    const local = raw !== null && "seeded" in raw && raw.seeded === true && !base ? null : raw;
    if (local !== null) {
      const localHash = await this.hashLocal(tomb.kind, local);
      const dirty =
        !base ||
        localHash !== base.hash ||
        (tomb.kind === "todo" && this.localRevision(tomb.kind, local) > base.revision);
      if (dirty) {
        this.upsertConflict(state, {
          kind: tomb.kind,
          id: tomb.id,
          localRevision: base?.revision ?? 0,
          localHash: localHash ?? undefined,
          remoteRevision: tomb.revision,
          remoteDeleted: true,
          detectedAt: new Date().toISOString(),
        });
        return;
      }
    }
    await this.removeLocal(tomb.kind, tomb.id);
    state.baselines[key] = { revision: tomb.revision, hash: "" };
    state.baselines[`${key}:deleted`] = { revision: tomb.revision, hash: "" };
    this.clearIssue(state, key);
  }

  // ---- 上传 ----

  private async pushDirty(state: SyncStateData, epoch: number, manual: boolean): Promise<void> {
    if (state.submitPaused && !manual) return;
    // 原样重试未完成的不可变请求（§9.1）。
    if (state.pending) {
      await this.submitPending(state, epoch);
      if (state.pending) return; // 部分失败保留，下轮继续
    }
    for (;;) {
      const batch = await this.buildBatch(state);
      if (batch.objects.length + batch.tombstones.length === 0) return;
      const request: PendingPush = {
        requestId: newRequestId(
          this.deps.randomId ?? (() => Math.random().toString(36).slice(2, 10)),
        ),
        generation: state.generation,
        objects: batch.objects,
        tombstones: batch.tombstones,
      };
      state.pending = request;
      await this.saveState();
      await this.submitPending(state, epoch);
      if (state.pending) return;
      if (epoch !== this.epoch) throw new SyncError("SERVER_ERROR", "上下文已失效。");
    }
  }

  // 已记录冲突且本机未再修改的版本不再重推，避免死循环（§9.2 决定前保留双方）。
  private conflictSettled(
    state: SyncStateData,
    kind: SyncKind,
    id: string,
    hash?: string,
  ): boolean {
    const conflict = state.conflicts.find((item) => item.kind === kind && item.id === id);
    if (!conflict) return false;
    if (hash === undefined) return true;
    return conflict.localHash === undefined || conflict.localHash === hash;
  }

  private async buildBatch(
    state: SyncStateData,
  ): Promise<{ objects: PendingObject[]; tombstones: PendingTombstone[] }> {
    const objects: PendingObject[] = [];
    const tombstones: PendingTombstone[] = [];
    // 待确认墓碑优先（§9.2 同步 index 不得丢弃未确认墓碑）。
    const pending = await this.deps.content.getPendingTombstones(this.deps.projectId);
    for (const item of pending) {
      if (objects.length + tombstones.length >= PUSH_BATCH) break;
      if (this.conflictSettled(state, "todo", item.id)) continue;
      if (state.rejected.some((record) => record.kind === "todo" && record.id === item.id))
        continue;
      const base = state.baselines[`todo/${item.id}`];
      tombstones.push({
        kind: "todo",
        id: item.id,
        baseRevision: base?.revision ?? 0,
        revision: (base?.revision ?? 0) + 1,
        deletedAt: item.deletedAt,
      });
    }
    const todos = await this.deps.content.listTodos(this.deps.projectId);
    for (const todo of todos) {
      if (objects.length + tombstones.length >= PUSH_BATCH) break;
      if (todo.deletedAt) continue; // 回收站本地保留，不上传（P6 边界，见模块注释）
      const key = `todo/${todo.id}`;
      const base = state.baselines[key];
      const hash = await sha256Hex(serializeTodo(todo, this.deps.deviceId()));
      if (base && base.hash === hash) continue;
      if (this.conflictSettled(state, "todo", todo.id, hash)) continue;
      if (
        state.rejected.some(
          (record) => record.kind === "todo" && record.id === todo.id && record.hash === hash,
        )
      ) {
        continue;
      }
      objects.push({
        kind: "todo",
        id: todo.id,
        baseRevision: base?.revision ?? 0,
        revision: todo.revision,
        hash,
      });
      await this.uploadPayload(hash, serializeTodo(todo, this.deps.deviceId()), "text/markdown");
    }
    if (objects.length + tombstones.length < PUSH_BATCH) {
      const classification = await this.buildClassificationObject(state);
      if (classification) {
        objects.push(classification);
        await this.uploadPayload(
          classification.hash,
          await this.classificationBytes(),
          "application/json",
        );
      }
    }
    if (objects.length + tombstones.length < PUSH_BATCH) {
      const index = await this.buildIndexObject(state);
      if (index) {
        objects.push(index);
        await this.uploadPayload(index.hash, await this.indexBytes(state), "application/json");
      }
    }
    if (objects.length + tombstones.length < PUSH_BATCH) {
      const images = await this.buildImageObjects(state);
      for (const image of images) {
        if (objects.length + tombstones.length >= PUSH_BATCH) break;
        objects.push(image.object);
        await this.uploadPayload(image.object.hash, image.bytes, "application/octet-stream");
      }
    }
    return { objects, tombstones };
  }

  private async uploadPayload(
    hash: string,
    data: string | ArrayBuffer,
    mediaType: string,
  ): Promise<void> {
    if (await this.deps.server.hasPayload(hash)) return;
    await this.deps.server.putPayload(hash, data, mediaType);
  }

  private async classificationBytes(): Promise<string> {
    const categories = await this.deps.content.listCategories(this.deps.projectId);
    const tags = await this.deps.content.listTags(this.deps.projectId);
    return serializeClassification(categories, tags);
  }

  private async buildClassificationObject(state: SyncStateData): Promise<PendingObject | null> {
    const bytes = await this.classificationBytes();
    const hash = await sha256Hex(bytes);
    const key = "classification/classification";
    const baseline = state.baselines[key];
    if (baseline && baseline.hash === hash) return null;
    if (this.conflictSettled(state, "classification", "classification", hash)) return null;
    if (state.rejected.some((record) => record.kind === "classification" && record.hash === hash)) {
      return null;
    }
    return {
      kind: "classification",
      id: "classification",
      baseRevision: baseline?.revision ?? 0,
      revision: (baseline?.revision ?? 0) + 1,
      hash,
    };
  }

  private async indexBytes(state: SyncStateData): Promise<string> {
    const order = await this.deps.content.getCustomOrder(this.deps.projectId);
    const pending = await this.deps.content.getPendingTombstones(this.deps.projectId);
    const index: IndexData = {
      customOrder: order,
      tombstones: pending.map((item) => {
        const base = state.baselines[`todo/${item.id}`];
        return {
          kind: "todo",
          id: item.id,
          revision: (base?.revision ?? 0) + 1,
          deletedAt: item.deletedAt,
          projectId: this.deps.projectId,
        };
      }),
    };
    return serializeIndex(index);
  }

  private async buildIndexObject(state: SyncStateData): Promise<PendingObject | null> {
    const bytes = await this.indexBytes(state);
    const hash = await sha256Hex(bytes);
    const key = "index/index";
    const baseline = state.baselines[key];
    if (baseline && baseline.hash === hash) return null;
    if (this.conflictSettled(state, "index", "index", hash)) return null;
    if (state.rejected.some((record) => record.kind === "index" && record.hash === hash)) {
      return null;
    }
    return {
      kind: "index",
      id: "index",
      baseRevision: baseline?.revision ?? 0,
      revision: (baseline?.revision ?? 0) + 1,
      hash,
    };
  }

  private async buildImageObjects(
    state: SyncStateData,
  ): Promise<{ object: PendingObject; bytes: ArrayBuffer }[]> {
    const result: { object: PendingObject; bytes: ArrayBuffer }[] = [];
    const images = await this.deps.content.listImages(this.deps.projectId);
    for (const image of images) {
      const key = `image/${image.path}`;
      if (this.conflictSettled(state, "image", image.path)) continue;
      const bytes = await image.blob.arrayBuffer();
      const hash = await sha256Hex(bytes);
      const baseline = state.baselines[key];
      if (baseline && baseline.hash === hash) continue;
      result.push({
        object: {
          kind: "image",
          id: image.path,
          baseRevision: baseline?.revision ?? 0,
          revision: (baseline?.revision ?? 0) + 1,
          hash,
        },
        bytes,
      });
    }
    return result;
  }

  private async submitPending(state: SyncStateData, epoch: number): Promise<void> {
    const pending = state.pending;
    if (!pending) return;
    let results: PushItemResult[];
    try {
      const response = await this.deps.server.push(this.deps.projectId, {
        requestId: pending.requestId,
        generation: pending.generation,
        objects: pending.objects,
        tombstones: pending.tombstones,
      });
      results = response.results;
    } catch (error) {
      if (error instanceof SyncError && error.code === "IDEMPOTENCY_CONFLICT") {
        // 停止复用异常请求 ID，核对远端结果后重建请求（§9.3）。
        state.pending = null;
        await this.saveState();
        return;
      }
      throw error;
    }
    if (epoch !== this.epoch) throw new SyncError("SERVER_ERROR", "上下文已失效。");
    // 逐项确认基线，发送后本地又有修改的仍保留待同步（§9.1：重算哈希比对）。
    for (const result of results) {
      const key = `${result.kind}/${result.id}`;
      if (result.status === "applied") {
        state.baselines[key] = { revision: result.revision ?? 0, hash: result.remoteHash ?? "" };
        if (result.kind === "todo" && result.remoteHash === undefined) {
          // 墓碑确认：从待确认队列移除，保留已确认删除标记。
          await this.deps.content.confirmTombstone(this.deps.projectId, result.id);
          state.baselines[`${key}:deleted`] = { revision: result.revision ?? 0, hash: "" };
        }
        state.conflicts = state.conflicts.filter((item) => changeKey(item) !== key);
        state.rejected = state.rejected.filter((item) => changeKey(item) !== key);
        continue;
      }
      if (result.status === "conflict") {
        const pushed = pending.objects.find((item) => changeKey(item) === key);
        this.upsertConflict(state, {
          kind: result.kind,
          id: result.id,
          localRevision: state.baselines[key]?.revision ?? 0,
          localHash: pushed?.hash,
          remoteRevision: result.remoteRevision ?? 0,
          remoteHash: result.remoteHash,
          remoteDeleted: result.remoteDeleted ?? false,
          detectedAt: new Date().toISOString(),
        });
        continue;
      }
      const pendingItem = [...pending.objects, ...pending.tombstones].find(
        (item) => changeKey(item) === key,
      );
      state.rejected = state.rejected.filter((item) => changeKey(item) !== key);
      state.rejected.push({
        kind: result.kind,
        id: result.id,
        code: result.code ?? "SERVER_ERROR",
        revision: pendingItem?.revision ?? 0,
        hash: "hash" in (pendingItem ?? {}) ? (pendingItem as PendingObject).hash : undefined,
      });
    }
    this.log(
      "push",
      results.filter((item) => item.status === "applied").length,
      undefined,
      pending.requestId,
    );
    state.pending = null;
    await this.saveState();
  }

  // ---- 冲突解决 ----

  async resolveKeepLocal(kind: SyncKind, id: string): Promise<void> {
    const state = await this.loadState();
    const key = changeKey({ kind, id });
    const conflict = state.conflicts.find((item) => changeKey(item) === key);
    if (!conflict) return;
    // 以最新远端基线提交本机版本（§9.2），保留恢复副本由调用方（UI）先行建立。
    if (kind === "todo") {
      const todos = await this.deps.content.listTodos(this.deps.projectId);
      const todo = todos.find((item) => item.id === id);
      if (!todo || todo.deletedAt) throw new SyncError("SERVER_ERROR", "本机版本已不存在。");
      const bytes = serializeTodo(todo, this.deps.deviceId());
      const hash = await sha256Hex(bytes);
      await this.uploadPayload(hash, bytes, "text/markdown");
      const request: PushRequest = {
        requestId: newRequestId(
          this.deps.randomId ?? (() => Math.random().toString(36).slice(2, 10)),
        ),
        generation: state.generation,
        objects: [
          {
            kind,
            id,
            baseRevision: conflict.remoteRevision,
            revision: conflict.remoteRevision + 1,
            hash,
          },
        ],
        tombstones: [],
      };
      state.pending = request;
      await this.saveState();
      await this.submitPending(state, this.epoch);
      return;
    }
    if (kind === "image") {
      const images = await this.deps.content.listImages(this.deps.projectId);
      const image = images.find((item) => item.path === id);
      if (!image) throw new SyncError("SERVER_ERROR", "本机图片已不存在。");
      const bytes = await image.blob.arrayBuffer();
      const hash = await sha256Hex(bytes);
      await this.uploadPayload(hash, bytes, "application/octet-stream");
      const request: PushRequest = {
        requestId: newRequestId(
          this.deps.randomId ?? (() => Math.random().toString(36).slice(2, 10)),
        ),
        generation: state.generation,
        objects: [
          {
            kind,
            id,
            baseRevision: conflict.remoteRevision,
            revision: conflict.remoteRevision + 1,
            hash,
          },
        ],
        tombstones: [],
      };
      state.pending = request;
      await this.saveState();
      await this.submitPending(state, this.epoch);
      notifyScope(this.scope);
      return;
    }
    // classification/index：重算当前字节后以远端基线提交。
    const bytes =
      kind === "classification" ? await this.classificationBytes() : await this.indexBytes(state);
    const hash = await sha256Hex(bytes);
    await this.uploadPayload(hash, bytes, "application/json");
    const request: PushRequest = {
      requestId: newRequestId(
        this.deps.randomId ?? (() => Math.random().toString(36).slice(2, 10)),
      ),
      generation: state.generation,
      objects: [
        {
          kind,
          id,
          baseRevision: conflict.remoteRevision,
          revision: conflict.remoteRevision + 1,
          hash,
        },
      ],
      tombstones: [],
    };
    state.pending = request;
    await this.saveState();
    await this.submitPending(state, this.epoch);
    notifyScope(this.scope);
  }

  async resolveUseRemote(kind: SyncKind, id: string): Promise<void> {
    const state = await this.loadState();
    const key = changeKey({ kind, id });
    const conflict = state.conflicts.find((item) => changeKey(item) === key);
    if (!conflict) return;
    if (conflict.remoteDeleted) {
      // 采用远端删除：移除本机并确认墓碑基线，保留恢复副本由调用方建立。
      await this.removeLocal(kind, id);
      state.baselines[key] = { revision: conflict.remoteRevision, hash: "" };
      state.baselines[`${key}:deleted`] = { revision: conflict.remoteRevision, hash: "" };
      state.conflicts = state.conflicts.filter((item) => changeKey(item) !== key);
      await this.saveState();
      notifyScope(this.scope);
      return;
    }
    if (!conflict.remoteHash) throw new SyncError("SERVER_ERROR", "远端版本缺失。");
    const data = await this.deps.server.getPayload(conflict.remoteHash);
    if (data === null) throw new SyncError("HASH_MISMATCH", "远端 payload 缺失。");
    const actual = await sha256Hex(data);
    if (actual !== conflict.remoteHash) throw new SyncError("HASH_MISMATCH", "远端 payload 损坏。");
    await this.writeLocal(kind, id, data, conflict.remoteRevision);
    state.baselines[key] = { revision: conflict.remoteRevision, hash: conflict.remoteHash };
    state.conflicts = state.conflicts.filter((item) => changeKey(item) !== key);
    await this.saveState();
    notifyScope(this.scope);
  }

  /** 解决前重新校验双方版本；变化则抛 REVISION_CONFLICT 由 UI 刷新比较（§9.2）。 */
  async revalidate(kind: SyncKind, id: string): Promise<boolean> {
    const state = await this.loadState();
    const key = changeKey({ kind, id });
    const conflict = state.conflicts.find((item) => changeKey(item) === key);
    if (!conflict || !conflict.remoteHash) return true;
    // 本地是否变化
    const local = await this.readLocal(kind, id, undefined, state);
    const localHash = local ? await this.hashLocal(kind, local) : null;
    if (localHash !== conflict.localHash && !(local === null && conflict.remoteDeleted)) {
      return false;
    }
    return true;
  }

  // ---- 本地读写（经 ContentPort，P6 不直接碰 Dexie） ----

  private async readLocal(
    kind: SyncKind,
    id: string,
    todoMap?: Map<string, Todo>,
    state?: SyncStateData,
  ): Promise<LocalSyncValue | null> {
    if (kind === "todo") {
      if (todoMap) return todoMap.get(id) ?? null;
      const todos = await this.deps.content.listTodos(this.deps.projectId);
      return todos.find((item) => item.id === id) ?? null;
    }
    if (kind === "image") {
      const images = await this.deps.content.listImages(this.deps.projectId);
      return images.find((item) => item.path === id)?.blob ?? null;
    }
    if (kind === "classification") {
      const [categories, tags, revisions] = await Promise.all([
        this.deps.content.listCategories(this.deps.projectId),
        this.deps.content.listTags(this.deps.projectId),
        this.deps.content.getContentRevisions(this.deps.projectId),
      ]);
      return {
        raw: serializeClassification(categories, tags),
        revision: revisions.classificationRev,
        seeded:
          (categories.length === 0 && tags.length === 0) ||
          (categories.length > 0 &&
            tags.length > 0 &&
            categories.every((category) => category.seeded === true) &&
            tags.every((tag) => tag.seeded === true)),
      };
    }
    if (kind === "index") {
      if (!state) return null;
      const [order, pending, revisions] = await Promise.all([
        this.deps.content.getCustomOrder(this.deps.projectId),
        this.deps.content.getPendingTombstones(this.deps.projectId),
        this.deps.content.getContentRevisions(this.deps.projectId),
      ]);
      return {
        raw: await this.indexBytes(state),
        revision: revisions.indexRev,
        seeded: order.inbox.length === 0 && order.all.length === 0 && pending.length === 0,
      };
    }
    return null;
  }

  private localRevision(kind: SyncKind, local: LocalSyncValue): number {
    if (kind === "todo") return (local as Todo).revision;
    if (kind === "classification" || kind === "index") return (local as RawLocal).revision;
    return 1;
  }

  private async hashLocal(kind: SyncKind, local: LocalSyncValue): Promise<string> {
    if (kind === "todo") {
      return sha256Hex(serializeTodo(local as Todo, this.deps.deviceId()));
    }
    if (kind === "image") {
      return sha256Hex(await (local as Blob).arrayBuffer());
    }
    return sha256Hex((local as RawLocal).raw);
  }

  private async writeLocal(
    kind: SyncKind,
    id: string,
    data: string | ArrayBuffer,
    revision: number,
  ): Promise<void> {
    if (kind === "todo") {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      const doc = parseTodoDoc(text);
      const todo = todoFromDoc(id, doc, revision);
      const full: Todo = {
        ...todo,
        title: deriveTitle(todo.body) || "未命名 Todo",
      };
      await this.deps.content.upsertTodoRemote(this.deps.projectId, full);
      return;
    }
    if (kind === "classification") {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      const parsed = JSON.parse(text) as {
        categories?: Category[];
        tags?: Tag[];
      };
      await this.deps.content.replaceClassification(
        this.deps.projectId,
        parsed.categories ?? [],
        parsed.tags ?? [],
      );
      return;
    }
    if (kind === "index") {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      const index = parseIndex(text);
      // 远端顺序采用，已确认的本机删除不因缺失重建由墓碑队列保证；
      // 未确认墓碑合并保留（§9.2）。
      const pending = await this.deps.content.getPendingTombstones(this.deps.projectId);
      void pending;
      await this.deps.content.setCustomOrder(this.deps.projectId, "inbox", index.customOrder.inbox);
      await this.deps.content.setCustomOrder(this.deps.projectId, "all", index.customOrder.all);
      return;
    }
    if (kind === "image") {
      const blob =
        data instanceof ArrayBuffer ? new Blob([data]) : new Blob([data as unknown as BlobPart]);
      await this.deps.content.putImage(this.deps.projectId, id, blob);
    }
  }

  private async removeLocal(kind: SyncKind, id: string): Promise<void> {
    if (kind === "todo") {
      await this.deps.content.removeTodoLocal(this.deps.projectId, id);
      return;
    }
    if (kind === "image") {
      // 图片远端删除：本机保留二进制但移除引用追踪（删除引用不删对象 §5.3）。
      return;
    }
  }

  private upsertConflict(
    state: SyncStateData,
    conflict: {
      kind: SyncKind;
      id: string;
      localRevision: number;
      localHash?: string;
      remoteRevision: number;
      remoteHash?: string;
      remoteDeleted: boolean;
      detectedAt: string;
    },
  ) {
    const key = changeKey(conflict);
    state.conflicts = state.conflicts.filter((item) => changeKey(item) !== key);
    state.conflicts.push({ ...conflict });
  }

  private clearIssue(state: SyncStateData, key: string) {
    state.conflicts = state.conflicts.filter((item) => changeKey(item) !== key);
    state.rejected = state.rejected.filter((item) => changeKey(item) !== key);
  }

  // ---- 查询（UI） ----

  async getState(): Promise<SyncStateData> {
    return this.loadState();
  }

  async setAutoSync(enabled: boolean): Promise<void> {
    const state = await this.loadState();
    state.autoSync = enabled;
    await this.saveState();
  }

  async remotePayload(kind: SyncKind, id: string): Promise<string | null> {
    const state = await this.loadState();
    const conflict = state.conflicts.find((item) => item.kind === kind && item.id === id);
    if (!conflict?.remoteHash) return null;
    const data = await this.deps.server.getPayload(conflict.remoteHash);
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    return null;
  }
}

// ---- 跨标签页通知（正文/令牌不广播，仅标识与失效 §9.3） ----

const CHANNEL = "tasktips-sync";
let channel: BroadcastChannel | null = null;
// 同标签页直投：BroadcastChannel 不投递给发送者自身，单页内的
// 同步完成通知走本地订阅；跨标签页仍走 channel。
const localListeners = new Set<(scope: string) => void>();

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL);
  return channel;
}

export function notifyScope(scope: string) {
  for (const listener of [...localListeners]) {
    try {
      listener(scope);
    } catch {
      // 忽略单个监听失败
    }
  }
  try {
    getChannel()?.postMessage({ type: "invalidated", scope });
  } catch {
    // 忽略
  }
}

export function subscribeInvalidation(listener: (scope: string) => void): () => void {
  localListeners.add(listener);
  const target = getChannel();
  if (!target) {
    return () => {
      localListeners.delete(listener);
    };
  }
  const handler = (event: MessageEvent) => {
    if (event.data?.type === "invalidated" && typeof event.data.scope === "string") {
      listener(event.data.scope as string);
    }
  };
  target.addEventListener("message", handler);
  return () => {
    localListeners.delete(listener);
    target.removeEventListener("message", handler);
  };
}
