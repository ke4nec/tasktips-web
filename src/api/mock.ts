import type {
  ActivateInput,
  ApiPort,
  ChangePasswordInput,
  LoginInput,
  RegisterDeviceInput,
} from "./port";
import { ApiError, type Account, type AuthResult, type Device, type Project } from "./types";

interface MockUser {
  password: string;
  disabled: boolean;
  projects: Project[];
  devices: (Device & { revoked?: boolean })[];
}

interface MockInvite {
  email: string;
  used: boolean;
}

// 内存后端：实现 §8.1 用户流程与 §8.2 契约语义，供 UI 先行与 E2E 确定性验证。
// 真实云端 Web 会话接口落地后，VITE_API_MODE=http 切换 HttpApi，契约以 OpenAPI 为准。
// 刷新凭据仿真 HttpOnly Cookie：经 localStorage 跨页面加载持久（真实刷新令牌
// 脚本不可读；Mock 仅为 dev/E2E 仿真该语义，不进入生产 Http 链路）。
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "Demo12345678";
export const DEMO_INVITATION_TOKEN = "demo-invitation-token";
export const DEMO_INVITE_EMAIL = "new@example.com";
export const MOCK_REFRESH_KEY = "tasktips:mock-refresh";

export class MockApi implements ApiPort {
  private users = new Map<string, MockUser>();
  private invites = new Map<string, MockInvite>();
  private sessionEmail: string | null = null;
  private projectSeq = 0;

  constructor() {
    this.users.set(DEMO_EMAIL, {
      password: DEMO_PASSWORD,
      disabled: false,
      projects: [{ id: "demo", name: "我的任务" }],
      devices: [],
    });
    this.invites.set(DEMO_INVITATION_TOKEN, { email: DEMO_INVITE_EMAIL, used: false });
  }

  private requireUser(email: string): MockUser {
    const user = this.users.get(email);
    if (!user) throw new ApiError("INVALID_CREDENTIALS", "邮箱或密码不正确。", 401);
    if (user.disabled) throw new ApiError("ACCOUNT_DISABLED", "账号已被禁用，请联系管理员。", 403);
    return user;
  }

  private issue(email: string): AuthResult {
    this.sessionEmail = email;
    try {
      localStorage.setItem(MOCK_REFRESH_KEY, email);
    } catch {
      // 仅内存态
    }
    return { accessToken: `mock-access-${email}`, expiresIn: 3600, account: { email } };
  }

  private storedSession(): string | null {
    try {
      return localStorage.getItem(MOCK_REFRESH_KEY);
    } catch {
      return null;
    }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = this.requireUser(input.email);
    if (user.password !== input.password) {
      throw new ApiError("INVALID_CREDENTIALS", "邮箱或密码不正确。", 401);
    }
    return this.issue(input.email);
  }

  async activateInvitation(input: ActivateInput): Promise<AuthResult> {
    const invite = this.invites.get(input.invitationToken);
    if (!invite || invite.used) {
      throw new ApiError(
        "INVITATION_INVALID",
        "邀请无效、已使用或已过期，请联系管理员获取新的邀请。",
        400,
      );
    }
    invite.used = true;
    this.users.set(invite.email, {
      password: input.password,
      disabled: false,
      projects: [{ id: `mock-${++this.projectSeq}`, name: "我的任务" }],
      devices: [],
    });
    return this.issue(invite.email);
  }

  async refresh(): Promise<{ accessToken: string; expiresIn: number; account: Account }> {
    // 跨页面加载后内存态丢失时，用持久化的刷新仿真恢复（对应 Cookie 语义）。
    const email = this.sessionEmail ?? this.storedSession();
    if (!email || !this.users.has(email)) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    this.sessionEmail = email;
    return {
      accessToken: `mock-access-${email}-${Date.now()}`,
      expiresIn: 3600,
      account: { email },
    };
  }

  async logout(): Promise<void> {
    // 幂等：重复注销同样成功（§8.2），同时清除刷新仿真。
    this.sessionEmail = null;
    try {
      localStorage.removeItem(MOCK_REFRESH_KEY);
    } catch {
      // 忽略
    }
  }

  async me(): Promise<Account> {
    if (!this.sessionEmail) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    return { email: this.sessionEmail };
  }

  async registerDevice(input: RegisterDeviceInput): Promise<Device> {
    if (!this.sessionEmail) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    const user = this.requireUser(this.sessionEmail);
    const existing = user.devices.find((device) => device.id === input.deviceId);
    if (existing) {
      existing.name = input.name;
      existing.revoked = false;
      return this.publicDevice(existing);
    }
    const device = {
      id: input.deviceId,
      name: input.name,
      platform: "web",
      createdAt: new Date().toISOString(),
    };
    user.devices.push(device);
    return this.publicDevice(device);
  }

  private publicDevice(device: Device & { revoked?: boolean }): Device {
    const { revoked: _revoked, ...rest } = device;
    return rest;
  }

  async listDevices(): Promise<Device[]> {
    if (!this.sessionEmail) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    return this.requireUser(this.sessionEmail)
      .devices.filter((device) => !device.revoked)
      .map((device) => this.publicDevice(device));
  }

  async renameDevice(id: string, name: string): Promise<Device> {
    if (!this.sessionEmail) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    const trimmed = name.trim();
    if (!trimmed) throw new ApiError("VALIDATION_ERROR", "设备名称不能为空。", 400);
    const device = this.requireUser(this.sessionEmail).devices.find(
      (item) => item.id === id && !item.revoked,
    );
    if (!device) throw new ApiError("NOT_FOUND", "设备不存在。", 404);
    device.name = trimmed;
    return this.publicDevice(device);
  }

  async revokeDevice(id: string): Promise<void> {
    if (!this.sessionEmail) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    const user = this.requireUser(this.sessionEmail);
    const device = user.devices.find((item) => item.id === id && !item.revoked);
    if (!device) throw new ApiError("NOT_FOUND", "设备不存在。", 404);
    device.revoked = true;
    // 撤销本机设备即退出当前会话（§8.3 终局凭证失效要求重新登录）。
    if (id === this.currentDeviceId()) {
      this.sessionEmail = null;
      try {
        localStorage.removeItem(MOCK_REFRESH_KEY);
      } catch {
        // 忽略
      }
    }
  }

  private currentDeviceId(): string | null {
    try {
      const prefix = "tasktips:device-id:";
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) return localStorage.getItem(key);
      }
      return null;
    } catch {
      return null;
    }
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    if (!this.sessionEmail) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    const user = this.requireUser(this.sessionEmail);
    if (user.password !== input.currentPassword) {
      throw new ApiError("INVALID_CREDENTIALS", "当前密码不正确。", 401);
    }
    user.password = input.newPassword;
    // 改密后清理浏览器会话并要求重新登录（§8.3）。
    this.sessionEmail = null;
    try {
      localStorage.removeItem(MOCK_REFRESH_KEY);
    } catch {
      // 忽略
    }
  }

  async listProjects(): Promise<Project[]> {
    if (!this.sessionEmail) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    return [...this.requireUser(this.sessionEmail).projects];
  }

  async createProject(name: string): Promise<Project> {
    if (!this.sessionEmail) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    const trimmed = name.trim();
    if (!trimmed) throw new ApiError("VALIDATION_ERROR", "项目名称不能为空。", 400);
    const project: Project = { id: `mock-${++this.projectSeq}`, name: trimmed };
    this.requireUser(this.sessionEmail).projects.push(project);
    return project;
  }

  async renameProject(id: string, name: string): Promise<Project> {
    if (!this.sessionEmail) {
      throw new ApiError("AUTHENTICATION_REQUIRED", "登录已失效，请重新登录。", 401);
    }
    const trimmed = name.trim();
    if (!trimmed) throw new ApiError("VALIDATION_ERROR", "项目名称不能为空。", 400);
    const project = this.requireUser(this.sessionEmail).projects.find((item) => item.id === id);
    if (!project) throw new ApiError("NOT_FOUND", "项目不存在。", 404);
    project.name = trimmed;
    return { ...project };
  }
}
