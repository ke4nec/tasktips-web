import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { api, setTokenProvider } from "@/api";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/api/mock";
import { ApiError, type Account } from "@/api/types";
import { useProjectStore } from "@/stores/project";

export const DEVICE_ID_PREFIX = "tasktips:device-id";
export const LAST_PROJECT_KEY = "tasktips:last-project";
export const PENDING_LOGOUT_KEY = "tasktips:pending-logout";

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
    // 激活会话绑定在临时设备上；真实后端要求注册设备与令牌设备一致（§8.2），
    // 因此撤销临时会话后，用邮箱绑定的稳定设备身份重新登录。
    try {
      await api.logout();
    } catch {
      // 临时会话清理失败不阻断；令牌 15 分钟后自然过期
    }
    await login(result.account.email, password);
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
  // 成功后补注册本机设备（upsert，刷新页面不重复创建 §8.1），
  // 并补执行离线退出时挂起的远端注销（§8.3）。
  async function restoreSession(): Promise<boolean> {
    const ok = await refreshAccess();
    if (!ok || !account.value || !deviceId.value) return ok;
    try {
      await api.registerDevice({ deviceId: deviceId.value, name: browserName() });
    } catch {
      // 设备注册失败不阻断进入工作台
    }
    try {
      if (localStorage.getItem(PENDING_LOGOUT_KEY) === "1") {
        await api.logout();
        localStorage.removeItem(PENDING_LOGOUT_KEY);
      }
    } catch {
      // 下次恢复时重试
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
    } catch (error) {
      // 离线退出：本地访问立即终止，远端注销挂起待下次联网（§8.3）。
      if (error instanceof ApiError && error.code === "NETWORK_ERROR") {
        try {
          localStorage.setItem(PENDING_LOGOUT_KEY, "1");
        } catch {
          // 忽略
        }
      } else {
        throw error;
      }
    }
    clearAuth();
    useProjectStore().reset();
    try {
      localStorage.removeItem(LAST_PROJECT_KEY);
    } catch {
      // 忽略
    }
  }

  // 测试/E2E 快捷登录（仅 Mock 模式有预置账号，HttpApi 下抛错）。
  async function mockLoginQuick(email: string = DEMO_EMAIL) {
    await login(email, DEMO_PASSWORD);
  }

  // 启动恢复只跑一次：真实 HTTP 下 Cookie 刷新有网络延迟，路由守卫必须等它
  // 完成再判定登录态，否则刷新页面会被误判为未登录（Mock 的同步 localStorage
  // 恰好掩盖了这个竞态）。
  let readyPromise: Promise<boolean> | null = null;
  function ready(): Promise<boolean> {
    readyPromise ??= restoreSession().catch(() => false);
    return readyPromise;
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
    ready,
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
