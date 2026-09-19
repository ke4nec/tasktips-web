import { defineStore } from "pinia";
import { computed, ref } from "vue";

// P1 会话占位：localStorage 模拟登录态，仅用于应用壳路由守卫与 E2E。
// P2 接入真实浏览器会话（§8：HttpOnly Cookie + 内存 access token）后删除此 mock。
export const MOCK_SESSION_KEY = "tasktips:mock-session";

export interface MockAccount {
  email: string;
}

function readAccount(): MockAccount | null {
  try {
    const raw = localStorage.getItem(MOCK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MockAccount>;
    return typeof parsed.email === "string" ? { email: parsed.email } : null;
  } catch {
    return null;
  }
}

export const useSessionStore = defineStore("session", () => {
  const account = ref<MockAccount | null>(readAccount());
  const isAuthenticated = computed(() => account.value !== null);

  function mockLogin(email: string) {
    account.value = { email };
    try {
      localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify({ email }));
    } catch {
      // 仅内存态
    }
  }

  function mockLogout() {
    account.value = null;
    try {
      localStorage.removeItem(MOCK_SESSION_KEY);
    } catch {
      // 忽略
    }
  }

  return { account, isAuthenticated, mockLogin, mockLogout };
});

// E2E 钩子（仅开发模式）：用例先访问页面再调用登录，状态经 localStorage 跨导航持久。
// 由 main.ts 在 Pinia 就绪后安装，避免模块顶层在 Pinia 外调用 store。
export function installSessionE2EHook() {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  const session = useSessionStore();
  (window as unknown as { __tasktips_e2e?: object }).__tasktips_e2e = {
    mockLogin: (email = "e2e@example.com") => session.mockLogin(email),
    mockLogout: () => session.mockLogout(),
  };
}
