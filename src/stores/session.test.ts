import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_SESSION_KEY, useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

describe("会话占位（P1 mock，P2 替换为真实会话）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("默认未登录", () => {
    expect(useSessionStore().isAuthenticated).toBe(false);
  });

  it("mock 登录后已认证并持久化", () => {
    const session = useSessionStore();
    session.mockLogin("user@example.com");
    expect(session.isAuthenticated).toBe(true);
    expect(session.account?.email).toBe("user@example.com");
    expect(localStorage.getItem(MOCK_SESSION_KEY)).toContain("user@example.com");
  });

  it("损坏的缓存不视为登录", () => {
    localStorage.setItem(MOCK_SESSION_KEY, "{broken");
    // 新建 pinia 使 store 重读缓存
    setActivePinia(createPinia());
    expect(useSessionStore().isAuthenticated).toBe(false);
  });

  it("退出后清除状态", () => {
    const session = useSessionStore();
    session.mockLogin("user@example.com");
    session.mockLogout();
    expect(session.isAuthenticated).toBe(false);
    expect(localStorage.getItem(MOCK_SESSION_KEY)).toBeNull();
  });
});

describe("全局轻提示", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it("后一条覆盖前一条并自动消失", () => {
    const ui = useUiStore();
    ui.notify("第一条");
    ui.notify("第二条");
    expect(ui.toastMessage).toBe("第二条");
    expect(ui.toastVisible).toBe(true);
    vi.advanceTimersByTime(3200);
    expect(ui.toastVisible).toBe(false);
  });
});
