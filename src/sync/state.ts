import type { SyncKind } from "./protocol";

export interface Baseline {
  revision: number;
  hash: string;
}

export interface PendingObject {
  kind: SyncKind;
  id: string;
  baseRevision: number;
  revision: number;
  hash: string;
}

export interface PendingTombstone {
  kind: SyncKind;
  id: string;
  baseRevision: number;
  revision: number;
  deletedAt: string;
}

export interface PendingPush {
  updatedAt?: string;
  deviceId?: string;
  requestId: string;
  generation: number;
  objects: PendingObject[];
  tombstones: PendingTombstone[];
}

export interface ConflictRecord {
  kind: SyncKind;
  id: string;
  localRevision: number;
  localHash?: string;
  remoteRevision: number;
  remoteHash?: string;
  remoteDeleted: boolean;
  detectedAt: string;
}

export interface RejectedRecord {
  kind: SyncKind;
  id: string;
  code: string;
  revision: number;
  hash?: string;
}

export interface SyncLogEntry {
  at: string;
  direction: "pull" | "push" | "bootstrap";
  count: number;
  code?: string;
  requestId?: string;
}

export type SyncStatusKind =
  | "synced"
  | "pending"
  | "syncing"
  | "conflict"
  | "partial"
  | "offline"
  | "paused"
  | "auth"
  | "maintenance"
  | "error";

// 同步基线与队列（设计文档 §9.1）：远端基线独立保存，不用本地 revision 推断。
export interface SyncStateData {
  generation: number;
  cursor: string | null;
  bootstrapped: boolean;
  baselines: Record<string, Baseline>;
  pending: PendingPush | null;
  conflicts: ConflictRecord[];
  rejected: RejectedRecord[];
  submitPaused: boolean;
  autoSync: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  backoffUntil: number;
  backoffStep: number;
  logs: SyncLogEntry[];
}

export function initialSyncState(): SyncStateData {
  return {
    generation: 0,
    cursor: null,
    bootstrapped: false,
    baselines: {},
    pending: null,
    conflicts: [],
    rejected: [],
    submitPaused: false,
    autoSync: true,
    lastSyncAt: null,
    lastError: null,
    backoffUntil: 0,
    backoffStep: 0,
    logs: [],
  };
}

export function baselineKey(kind: SyncKind, id: string): string {
  return `${kind}/${id}`;
}
