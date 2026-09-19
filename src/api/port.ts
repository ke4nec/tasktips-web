import type { Account, AuthResult, Device, Project } from "./types";

// ApiPort：业务代码唯一依赖的后端抽象（设计文档 §8.2、§11.1）。
// Mock 先行：默认 MockApi；VITE_API_MODE=http 时用 HttpApi（真实 fetch）。
export interface LoginInput {
  email: string;
  password: string;
  deviceId: string;
}

export interface ActivateInput {
  invitationToken: string;
  password: string;
  deviceId: string;
}

export interface RegisterDeviceInput {
  deviceId: string;
  name: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ApiPort {
  login(input: LoginInput): Promise<AuthResult>;
  activateInvitation(input: ActivateInput): Promise<AuthResult>;
  refresh(): Promise<{ accessToken: string; expiresIn: number; account: Account }>;
  logout(): Promise<void>;
  me(): Promise<Account>;
  registerDevice(input: RegisterDeviceInput): Promise<Device>;
  listDevices(): Promise<Device[]>;
  renameDevice(id: string, name: string): Promise<Device>;
  revokeDevice(id: string): Promise<void>;
  changePassword(input: ChangePasswordInput): Promise<void>;
  listProjects(): Promise<Project[]>;
  createProject(name: string): Promise<Project>;
  renameProject(id: string, name: string): Promise<Project>;
}
