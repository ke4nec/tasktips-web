// API 层面向领域的数据契约（设计文档 §8、§11）。
// 传输细节（snake_case、信封字段）收敛在 http.ts，Mock 与业务代码只用这些类型。
export interface Account {
  email: string;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  account: Account;
}

export interface Device {
  id: string;
  name: string;
  platform: string;
}

export interface Project {
  id: string;
  name: string;
}

export type ApiErrorCode =
  | "INVALID_CREDENTIALS"
  | "INVITATION_INVALID"
  | "ACCOUNT_DISABLED"
  | "DEVICE_REVOKED"
  | "AUTHENTICATION_REQUIRED"
  | "PROJECT_MAINTENANCE"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "NETWORK_ERROR"
  | "WEB_AUTH_NOT_SUPPORTED";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;

  constructor(code: ApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

// 认证失败是否终局（需要重新登录），可重试的网络错误返回 false。
export function isTerminalAuthFailure(code: ApiErrorCode): boolean {
  return (
    code === "AUTHENTICATION_REQUIRED" || code === "ACCOUNT_DISABLED" || code === "DEVICE_REVOKED"
  );
}
