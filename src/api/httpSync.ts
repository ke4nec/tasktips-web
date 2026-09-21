import type {
  HistoryEntry,
  ObjectEnvelope,
  PushItemResult,
  PushRequest,
  RestoreInfo,
  SnapshotInfo,
  SyncErrorCode,
  SyncKind,
  SyncPage,
  SyncServerPort,
  Tombstone,
} from "@/sync/protocol";
import { SyncError } from "@/sync/protocol";
import {
  CLASSIFICATION_SCHEMA_VERSION,
  INDEX_SCHEMA_VERSION,
  TODO_SCHEMA_VERSION,
} from "@/sync/serialize";

// 图片是原始字节，无自有 schema 文档：信封 schemaVersion 与索引一致。
const IMAGE_SCHEMA_VERSION = 1;

interface WireChange {
  type?: "object" | "tombstone";
  kind: SyncKind;
  id: string;
  revision: number;
  contentHash?: string;
  deletedAt?: string;
  updatedAt?: string;
  changeSequence?: number;
}

interface WirePushItem {
  status: "applied" | "conflict" | "rejected";
  kind: SyncKind;
  id: string;
  revision?: number;
  actualRevision?: number | null;
  code?: string;
}

interface WireSnapshot {
  id: string;
  projectId: string;
  changeSequence: number;
  status: "pending" | "ready" | "failed";
  createdAt?: string;
}

interface WireRestoreJob {
  id: string;
  reason: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt?: string;
}

const BOOTSTRAP_PAGE_PREFIX = "b:";

function schemaVersionOf(kind: SyncKind): number {
  if (kind === "todo") return TODO_SCHEMA_VERSION;
  if (kind === "classification") return CLASSIFICATION_SCHEMA_VERSION;
  if (kind === "index") return INDEX_SCHEMA_VERSION;
  return IMAGE_SCHEMA_VERSION;
}

// 云端 time crate（serde-human-readable）的线格式：
// `YYYY-MM-DD HH:MM:SS.<亚秒> ±HH:MM:SS`——空格分隔、必带小数秒与三段偏移。
// 统一用 UTC 输出（+00:00:00），小数秒取毫秒三位（解析端位数灵活）。
/** 云端 time 线格式 → ISO（UI 展示与 Date 计算用）；解析失败原样返回。 */
export function parseCloudTimestamp(value: string | undefined): string {
  if (!value) return new Date(0).toISOString();
  // `YYYY-MM-DD HH:MM:SS.nnn +00:00:00` → `YYYY-MM-DDTHH:MM:SS.nnn+00:00`
  const normalized = value
    .trim()
    .replace(" ", "T")
    .replace(/ \+/, "+")
    .replace(/(\+\d{2}:\d{2}):\d{2}$/, "$1");
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

export function formatCloudTimestamp(date: Date = new Date()): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  return (
    `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}` +
    `.${pad(date.getUTCMilliseconds(), 3)} +00:00:00`
  );
}

/** 云端变更信封 → 端口信封/墓碑。 */
export function toPortChange(change: WireChange, projectId: string): ObjectEnvelope | Tombstone {
  if (change.type === "tombstone" || change.deletedAt !== undefined) {
    return {
      kind: change.kind,
      id: change.id,
      revision: change.revision,
      deletedAt: change.deletedAt ?? new Date(0).toISOString(),
      projectId,
    };
  }
  return {
    kind: change.kind,
    id: change.id,
    revision: change.revision,
    hash: change.contentHash ?? "",
  };
}

export function toHistoryEntry(change: WireChange): HistoryEntry {
  return {
    sequence: change.changeSequence ?? 0,
    kind: change.kind,
    id: change.id,
    revision: change.revision,
    hash: change.contentHash,
    deleted: change.type === "tombstone" || change.deletedAt !== undefined,
    at: parseCloudTimestamp(change.updatedAt ?? change.deletedAt),
  };
}

/**
 * 云端 push 结果 → 端口结果。applied 项云端不回传 contentHash，
 * 用请求里自己推送的哈希补齐（引擎据此更新基线）；conflict 项的
 * remoteHash 由引擎在随后的 pull 周期用远端变更回填（§9.2）。
 */
export function toPortPushResult(item: WirePushItem, request: PushRequest): PushItemResult {
  if (item.status === "applied") {
    const pushed = request.objects.find(
      (object) => object.kind === item.kind && object.id === item.id,
    );
    return {
      kind: item.kind,
      id: item.id,
      status: "applied",
      revision: item.revision,
      remoteHash: pushed?.hash,
    };
  }
  if (item.status === "conflict") {
    return {
      kind: item.kind,
      id: item.id,
      status: "conflict",
      remoteRevision: item.actualRevision ?? 0,
    };
  }
  return {
    kind: item.kind,
    id: item.id,
    status: "rejected",
    code: item.code ?? "SERVER_ERROR",
  };
}

const CODE_MAP: Record<string, SyncErrorCode> = {
  CURSOR_INVALID: "CURSOR_INVALID",
  GENERATION_MISMATCH: "GENERATION_MISMATCH",
  REVISION_CONFLICT: "REVISION_CONFLICT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  SCHEMA_UNSUPPORTED: "SCHEMA_UNSUPPORTED",
  HASH_MISMATCH: "HASH_MISMATCH",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  PROJECT_MAINTENANCE: "PROJECT_MAINTENANCE",
  PROJECT_NOT_FOUND: "NOT_FOUND",
  PAYLOAD_NOT_FOUND: "NOT_FOUND",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_REQUEST: "VALIDATION_ERROR",
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  DEVICE_REVOKED: "DEVICE_REVOKED",
};

function syncErrorFromResponse(status: number, body: unknown): SyncError {
  const code = (body as { code?: string } | null)?.code ?? "";
  if (status === 401) return new SyncError("AUTHENTICATION_REQUIRED", "登录已失效。");
  if (status === 429) return new SyncError("SERVER_ERROR", "请求过于频繁，稍后重试。");
  if (status >= 500) return new SyncError("SERVER_ERROR", "云端暂时不可用。");
  const mapped = CODE_MAP[code];
  const message = (body as { message?: string } | null)?.message ?? "同步请求失败。";
  return mapped ? new SyncError(mapped, message) : new SyncError("SERVER_ERROR", message);
}

export interface HttpSyncOptions {
  projectId: string;
  getToken: () => string | null;
  deviceId: () => string;
  baseUrl?: string;
}

// 真实云端同步端口（设计文档 §9）：对齐 tasktips-cloud 的 sync/payload/
// history/snapshot 契约，与 MockSyncServer 实现同一 SyncServerPort，
// 引擎代码不变。Bootstrap 是两段式：分页用 pageToken，末页给出签名
// cursor 供 pull 使用——端口游标加 "b:" 前缀区分两种令牌。
export class HttpSyncServer implements SyncServerPort {
  constructor(private readonly options: HttpSyncOptions) {}

  private get projectId(): string {
    return this.options.projectId;
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    const token = this.options.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl ?? ""}${path}`, { ...init, headers });
    } catch {
      throw new SyncError("NETWORK_ERROR", "网络不可用，请检查连接后重试。");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw syncErrorFromResponse(response.status, body);
    }
    return (await response.json()) as T;
  }

  async bootstrap(projectId: string, cursor: string, limit: number): Promise<SyncPage> {
    const isPage = cursor.startsWith(BOOTSTRAP_PAGE_PREFIX);
    const body: Record<string, unknown> = { limit };
    if (isPage) body.pageToken = cursor.slice(BOOTSTRAP_PAGE_PREFIX.length);
    const data = await this.json<{
      generation: number;
      items: WireChange[];
      hasMore: boolean;
      nextPageToken: string | null;
      cursor: string | null;
    }>(`/api/v1/projects/${encodeURIComponent(projectId)}/sync/bootstrap`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      generation: data.generation,
      changes: data.items.map((item) => toPortChange(item, projectId)),
      nextCursor: data.hasMore
        ? `${BOOTSTRAP_PAGE_PREFIX}${data.nextPageToken ?? ""}`
        : (data.cursor ?? ""),
      done: !data.hasMore,
    };
  }

  async pull(projectId: string, cursor: string, limit: number): Promise<SyncPage> {
    const data = await this.json<{
      generation: number;
      changes: WireChange[];
      nextCursor: string;
      hasMore: boolean;
    }>(`/api/v1/projects/${encodeURIComponent(projectId)}/sync/pull`, {
      method: "POST",
      body: JSON.stringify({ cursor, limit }),
    });
    return {
      generation: data.generation,
      changes: data.changes.map((item) => toPortChange(item, projectId)),
      nextCursor: data.nextCursor,
      done: !data.hasMore,
    };
  }

  async push(projectId: string, request: PushRequest): Promise<{ results: PushItemResult[] }> {
    const now = formatCloudTimestamp();
    const deviceId = this.options.deviceId();
    const data = await this.json<{ results: WirePushItem[] }>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/sync/push`,
      {
        method: "POST",
        body: JSON.stringify({
          requestId: request.requestId,
          generation: request.generation,
          objects: request.objects.map((object) => ({
            kind: object.kind,
            id: object.id,
            schemaVersion: schemaVersionOf(object.kind),
            // 云端 CAS 严格校验 revision == baseRevision + 1；本地 revision 计数器
            // 只用于本地状态，上送值按基线计算（Mock 同语义：服务端自算 base+1）。
            revision: (object.baseRevision || 0) + 1,
            baseRevision: object.baseRevision > 0 ? object.baseRevision : null,
            contentHash: object.hash,
            updatedAt: now,
            deviceId,
          })),
          tombstones: request.tombstones.map((tombstone) => ({
            kind: tombstone.kind,
            id: tombstone.id,
            revision: (tombstone.baseRevision || 0) + 1,
            baseRevision: tombstone.baseRevision > 0 ? tombstone.baseRevision : null,
            deletedAt: formatCloudTimestamp(new Date(tombstone.deletedAt)),
            deviceId,
          })),
        }),
      },
    );
    return { results: data.results.map((item) => toPortPushResult(item, request)) };
  }

  private async raw(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    const token = this.options.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl ?? ""}${path}`, { ...init, headers });
    } catch {
      throw new SyncError("NETWORK_ERROR", "网络不可用，请检查连接后重试。");
    }
    return response;
  }

  private payloadPath(hash: string): string {
    return `/api/v1/projects/${encodeURIComponent(this.projectId)}/payloads/${hash}`;
  }

  async hasPayload(hash: string): Promise<boolean> {
    const response = await this.raw(this.payloadPath(hash), { method: "HEAD" });
    if (response.ok) return true;
    if (response.status === 404) return false;
    throw syncErrorFromResponse(response.status, await response.json().catch(() => null));
  }

  async putPayload(hash: string, data: string | ArrayBuffer, mediaType?: string): Promise<void> {
    // 字符串按 UTF-8 编码上传，与引擎 sha256Hex 的字节口径一致；
    // Content-Type 按对象类型给出（云端 valid_media_type 校验）。
    const contentType = mediaType ?? "application/octet-stream";
    const body: BodyInit =
      typeof data === "string" ? data : new Blob([data], { type: contentType });
    const response = await this.raw(this.payloadPath(hash), {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    });
    if (response.ok) return;
    throw syncErrorFromResponse(response.status, await response.json().catch(() => null));
  }

  async getPayload(hash: string): Promise<string | ArrayBuffer | null> {
    const response = await this.raw(this.payloadPath(hash), { method: "GET" });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw syncErrorFromResponse(response.status, await response.json().catch(() => null));
    }
    return await response.arrayBuffer();
  }

  async history(
    projectId: string,
    afterSequence: number | null,
    limit: number,
  ): Promise<{ entries: HistoryEntry[]; nextSequence: number | null }> {
    return this.historyOf(
      `/api/v1/projects/${encodeURIComponent(projectId)}/history`,
      afterSequence,
      limit,
    );
  }

  async objectHistory(
    projectId: string,
    kind: SyncKind,
    id: string,
    afterSequence: number | null,
    limit: number,
  ): Promise<{ entries: HistoryEntry[]; nextSequence: number | null }> {
    return this.historyOf(
      `/api/v1/projects/${encodeURIComponent(projectId)}/objects/${encodeURIComponent(
        kind,
      )}/${encodeURIComponent(id)}/history`,
      afterSequence,
      limit,
    );
  }

  private async historyOf(
    path: string,
    afterSequence: number | null,
    limit: number,
  ): Promise<{ entries: HistoryEntry[]; nextSequence: number | null }> {
    const query = new URLSearchParams();
    if (afterSequence !== null) query.set("afterSequence", String(afterSequence));
    query.set("limit", String(limit));
    const data = await this.json<{ items: WireChange[]; hasMore: boolean }>(
      `${path}?${query.toString()}`,
    );
    const entries = data.items.map(toHistoryEntry);
    const last = entries[entries.length - 1];
    return { entries, nextSequence: data.hasMore && last ? last.sequence : null };
  }

  async listSnapshots(projectId: string): Promise<SnapshotInfo[]> {
    const data = await this.json<{ items: WireSnapshot[] }>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/snapshots`,
    );
    return data.items
      .filter((item) => item.status !== "failed")
      .map((item) => ({
        id: item.id,
        projectId: item.projectId,
        changeSequence: item.changeSequence,
        status: item.status === "ready" ? ("ready" as const) : ("creating" as const),
        // 云端快照无 label 字段：留空由界面回退显示创建时间。
        label: "",
        createdAt: parseCloudTimestamp(item.createdAt),
      }));
  }

  async createSnapshot(projectId: string, _label: string): Promise<SnapshotInfo> {
    const item = await this.json<WireSnapshot>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/snapshots`,
      { method: "POST" },
    );
    return {
      id: item.id,
      projectId: item.projectId,
      changeSequence: item.changeSequence,
      status: item.status === "ready" ? "ready" : "creating",
      label: "",
      createdAt: parseCloudTimestamp(item.createdAt),
    };
  }

  async createRestore(
    projectId: string,
    input: { snapshotId?: string; sequence?: number; reason: string },
  ): Promise<RestoreInfo> {
    const body = input.snapshotId
      ? { snapshotId: input.snapshotId, reason: input.reason }
      : { targetChangeSequence: input.sequence ?? 0, reason: input.reason };
    const job = await this.json<WireRestoreJob>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/restores`,
      { method: "POST", body: JSON.stringify(body) },
    );
    return toRestoreInfo(job);
  }

  async getRestore(projectId: string, id: string): Promise<RestoreInfo> {
    const job = await this.json<WireRestoreJob>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/restores/${encodeURIComponent(id)}`,
    );
    return toRestoreInfo(job);
  }

  async cancelRestore(projectId: string, id: string, reason: string): Promise<RestoreInfo> {
    const job = await this.json<WireRestoreJob>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/restores/${encodeURIComponent(id)}/cancel`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
    return toRestoreInfo(job);
  }
}

function toRestoreInfo(job: WireRestoreJob): RestoreInfo {
  const status: RestoreInfo["status"] =
    job.status === "succeeded"
      ? "ready"
      : job.status === "cancelled"
        ? "cancelled"
        : job.status === "failed"
          ? "failed"
          : "pending";
  return {
    id: job.id,
    status,
    reason: job.reason,
    createdAt: parseCloudTimestamp(job.createdAt),
  };
}

// 单测可见的线格式形状（内部接口的测试投影）。
export type WireChangeForTest = {
  type?: "object" | "tombstone";
  kind: import("@/sync/protocol").SyncKind;
  id: string;
  revision: number;
  contentHash?: string;
  deletedAt?: string;
  updatedAt?: string;
  changeSequence?: number;
};
