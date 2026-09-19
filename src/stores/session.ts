import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { api, setTokenProvider } from "@/api";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/api/mock";
import type { Account } from "@/api/types";
import { useProjectStore } from "@/stores/project";

export const DEVICE_ID_PREFIX = "tasktips:device-id";
export const LAST_PROJECT_KEY = "tasktips:last-project";

// access token 仅存内存（§8.2），HttpApi 经 provider 读取，脚本存储中没有刷新令牌。
let currentToken: string | null = null;
setTokenProvider(() => currentToken);

function deviceKey(email: string): string {
  return `${DEVICE_ID_PREFIX}:${email}`;
}

function getOrCreateDeviceId(email: string): string {
  try {
    const existing = localStorage.getItem(deviceKey(email));
    if (existing) return existing;
    const created =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(deviceKey(email), created);
    return created;
  } catch {
    return `web-memory-${Math.random().toString(36).slice(2)}`;
  }
}

function browserName(): string {
  return "此浏览器";
}

// 浏览器会话（设计文档 §8）：邀请激活/登录建立会话，刷新经 Cookie（Mock 下为内存态）。
export const useSessionStore = defineStore("session", () => {
  const account = ref<Account | null>(null);
  const accessToken = ref<string | null>(null);
  const deviceId = ref<string | null>(null);
  const isAuthenticated = computed(() => account.value !== null && accessToken.value !== null);

  function applyAuth(result: { accessToken: string; account: Account }, email: string) {
    account.value = result.account;
    accessToken.value = result.accessToken;
    currentToken = result.accessToken;
    deviceId.value = getOrCreateDeviceId(email);
  }

  async function afterAuth() {
    const projects = useProjectStore();
    await projects.load();
    await projects.ensureDefaultProject();
  }

  async function login(email: string, password: string) {
    const normalized = email.trim();
    const id = getOrCreateDeviceId(normalized);
    const result = await api.login({ email: normalized, password, deviceId: id });
    applyAuth(result, normalized);
    await api.registerDevice({ deviceId: id, name: browserName() });
    await afterAuth();
  }

  async function activate(invitationToken: string, password: string) {
    // 账号邮箱由邀请绑定，调用成功后从结果中取得，不信任表单输入。
    const provisionalId = getOrCreateDeviceId(`invite:${invitationToken}`);
    const result = await api.activateInvitation({
      invitationToken,
      password,
      deviceId: provisionalId,
    });
    applyAuth(result, result.account.email);
    const id = getOrCreateDeviceId(result.account.email);
    deviceId.value = id;
    await api.registerDevice({ deviceId: id, name: browserName() });
    await afterAuth();
  }

  async function refreshAccess(): Promise<boolean> {
    try {
      const result = await api.refresh();
      applyAuth(result, result.account.email);
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }

  // 启动恢复：先刷新会话再读身份（§8.3），失败即未登录态。
  // 成功后补注册本机设备（upsert，刷新页面不重复创建 §8.1）。
  async function restoreSession(): Promise<boolean> {
    const ok = await refreshAccess();
    if (ok && account.value && deviceId.value) {
      try {
        await api.registerDevice({ deviceId: deviceId.value, name: browserName() });
      } catch {
        // 设备注册失败不阻断进入工作台
      }
    }
    return ok;
  }

  function clearAuth() {
    account.value = null;
    accessToken.value = null;
    currentToken = null;
    deviceId.value = null;
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      clearAuth();
      useProjectStore().reset();
      try {
        localStorage.removeItem(LAST_PROJECT_KEY);
      } catch {
        // 忽略
      }
    }
  }

  // 测试/E2E 快捷登录（仅 Mock 模式有预置账号，HttpApi 下抛错）。
  async function mockLoginQuick(email: string = DEMO_EMAIL) {
    await login(email, DEMO_PASSWORD);
  }

  return {
    account,
    accessToken,
    deviceId,
    isAuthenticated,
    login,
    activate,
    refreshAccess,
    restoreSession,
    logout,
    mockLoginQuick,
  };
});

// E2E 钩子（仅开发模式）：用例先访问页面再调用登录，状态经 token/持久化跨导航。
// 由 main.ts 在 Pinia 就绪后安装。
export function installSessionE2EHook() {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  const session = useSessionStore();
  (window as unknown as { __tasktips_e2e?: object }).__tasktips_e2e = {
    mockLogin: (email?: string) => session.mockLoginQuick(email),
    mockLogout: () => session.logout(),
  };
}
