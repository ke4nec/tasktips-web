import type { ActivateInput, ApiPort, RegisterDeviceInput } from "./port";
import { ApiError, type Account, type AuthResult, type Device, type Project } from "./types";

// 真实 HTTP 实现：业务接口直调现有云端 API；4 个 Web 会话 Cookie 接口
// （§8.2）在 tasktips-cloud 落地前显式抛 WEB_AUTH_NOT_SUPPORTED，不静默降级。
export class HttpApi implements ApiPort {
  constructor(
    private readonly baseUrl = "",
    private readonly getToken: () => string | null = () => null,
  ) {}

  private async request<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    const token = this.getToken();
    if (auth && token) headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiError("NETWORK_ERROR", "网络不可用，请检查连接后重试。");
    }
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    if (!response.ok) {
      throw new ApiError(
        (body?.code as ApiError["code"]) ?? "NETWORK_ERROR",
        body?.message ?? `请求失败（${response.status}）。`,
        response.status,
      );
    }
    return body as T;
  }

  async login(): Promise<AuthResult> {
    throw new ApiError(
      "WEB_AUTH_NOT_SUPPORTED",
      "浏览器会话登录接口尚未在云端实现，当前使用 Mock 模式。",
      501,
    );
  }

  async activateInvitation(_input: ActivateInput): Promise<AuthResult> {
    void _input;
    throw new ApiError(
      "WEB_AUTH_NOT_SUPPORTED",
      "邀请激活接口尚未在云端实现，当前使用 Mock 模式。",
      501,
    );
  }

  async refresh(): Promise<{ accessToken: string; expiresIn: number; account: Account }> {
    const data = await this.request<{ accessToken: string; expiresIn: number }>(
      "/api/v1/web/auth/refresh",
      { method: "POST", credentials: "include" },
      false,
    );
    const account = await this.meWith(data.accessToken);
    return { ...data, account };
  }

  async logout(): Promise<void> {
    await this.request(
      "/api/v1/web/auth/logout",
      { method: "POST", credentials: "include" },
      false,
    );
  }

  async me(): Promise<Account> {
    const data = await this.request<{ email: string }>("/api/v1/me");
    return { email: data.email };
  }

  private async meWith(token: string): Promise<Account> {
    const response = await fetch("/api/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    const data = (await response.json()) as { email: string };
    return { email: data.email };
  }

  async registerDevice(input: RegisterDeviceInput): Promise<Device> {
    const data = await this.request<{ id: string; name: string; platform: string }>(
      "/api/v1/devices/register",
      {
        method: "POST",
        body: JSON.stringify({ deviceId: input.deviceId, name: input.name, platform: "web" }),
      },
    );
    return { id: data.id, name: data.name, platform: data.platform };
  }

  async listProjects(): Promise<Project[]> {
    const data = await this.request<{ projects: { id: string; name: string }[] }>(
      "/api/v1/projects",
    );
    return data.projects.map((item) => ({ id: item.id, name: item.name }));
  }

  async createProject(name: string): Promise<Project> {
    const data = await this.request<{ id: string; name: string }>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return { id: data.id, name: data.name };
  }

  async renameProject(id: string, name: string): Promise<Project> {
    const data = await this.request<{ id: string; name: string }>(`/api/v1/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    return { id: data.id, name: data.name };
  }
}
