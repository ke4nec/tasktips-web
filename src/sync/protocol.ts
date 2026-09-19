// 同步协议类型：对齐移动端 sync_engine 与云端 sync 契约（设计文档 §9）。
// MockSyncServer（Mock 先行）与未来的 HttpSync 实现同一 SyncServerPort。
export type SyncKind = "todo" | "classification" | "index" | "image";

export interface ObjectEnvelope {
  kind: SyncKind;
  id: string;
  revision: number;
  hash: string;
}

export interface Tombstone {
  kind: SyncKind;
  id: string;
  revision: number;
  deletedAt: string;
  projectId: string;
}

export interface PushObject {
  kind: SyncKind;
  id: string;
  baseRevision: number;
  revision: number;
  hash: string;
}

export interface PushTombstone {
  kind: SyncKind;
  id: string;
  baseRevision: number;
  revision: number;
  deletedAt: string;
}

export interface PushRequest {
  requestId: string;
  generation: number;
  objects: PushObject[];
  tombstones: PushTombstone[];
}

export type PushItemStatus = "applied" | "conflict" | "rejected";

export interface PushItemResult {
  kind: SyncKind;
  id: string;
  status: PushItemStatus;
  code?: string;
  revision?: number;
  remoteRevision?: number;
  remoteHash?: string;
  remoteDeleted?: boolean;
}

export type SyncErrorCode =
  | "NETWORK_ERROR"
  | "AUTHENTICATION_REQUIRED"
  | "ACCOUNT_DISABLED"
  | "DEVICE_REVOKED"
  | "PROJECT_MAINTENANCE"
  | "GENERATION_MISMATCH"
  | "CURSOR_INVALID"
  | "REVISION_CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "SCHEMA_UNSUPPORTED"
  | "HASH_MISMATCH"
  | "IDEMPOTENCY_CONFLICT"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "SERVER_ERROR";

export class SyncError extends Error {
  readonly code: SyncErrorCode;

  constructor(code: SyncErrorCode, message: string) {
    super(message);
    this.name = "SyncError";
    this.code = code;
  }
}

export function isTerminalSyncAuth(code: SyncErrorCode): boolean {
  return (
    code === "AUTHENTICATION_REQUIRED" || code === "ACCOUNT_DISABLED" || code === "DEVICE_REVOKED"
  );
}

export interface SyncPage {
  generation: number;
  changes: (ObjectEnvelope | Tombstone)[];
  /** 恢复点（恒为字符串）；done 为假时继续用它取下一页。 */
  nextCursor: string;
  done: boolean;
}

export interface SyncServerPort {
  bootstrap(projectId: string, cursor: string, limit: number): Promise<SyncPage>;
  pull(projectId: string, cursor: string, limit: number): Promise<SyncPage>;
  push(projectId: string, request: PushRequest): Promise<{ results: PushItemResult[] }>;
  hasPayload(hash: string): Promise<boolean>;
  putPayload(hash: string, data: string | ArrayBuffer): Promise<void>;
  getPayload(hash: string): Promise<string | ArrayBuffer | null>;
  history(
    projectId: string,
    afterSequence: number | null,
    limit: number,
  ): Promise<{ entries: HistoryEntry[]; nextSequence: number | null }>;
  objectHistory(
    projectId: string,
    kind: SyncKind,
    id: string,
    afterSequence: number | null,
    limit: number,
  ): Promise<{ entries: HistoryEntry[]; nextSequence: number | null }>;
  listSnapshots(projectId: string): Promise<SnapshotInfo[]>;
  createSnapshot(projectId: string, label: string): Promise<SnapshotInfo>;
  createRestore(
    projectId: string,
    input: { snapshotId?: string; sequence?: number; reason: string },
  ): Promise<RestoreInfo>;
  getRestore(projectId: string, id: string): Promise<RestoreInfo>;
  cancelRestore(projectId: string, id: string, reason: string): Promise<RestoreInfo>;
}

// 项目历史条目：只加载信封，点击记录才下载 payload（§10.1）。
export interface HistoryEntry {
  sequence: number;
  kind: SyncKind;
  id: string;
  revision: number;
  hash?: string;
  deleted: boolean;
  at: string;
}

export interface SnapshotInfo {
  id: string;
  projectId: string;
  changeSequence: number;
  status: "ready" | "creating";
  label: string;
  createdAt: string;
}

export type RestoreStatus = "pending" | "ready" | "cancelled" | "failed";

export interface RestoreInfo {
  id: string;
  status: RestoreStatus;
  reason: string;
  createdAt: string;
}

export function isTombstone(change: ObjectEnvelope | Tombstone): change is Tombstone {
  return (change as Tombstone).deletedAt !== undefined;
}

export function changeKey(change: { kind: SyncKind; id: string }): string {
  return `${change.kind}/${change.id}`;
}
