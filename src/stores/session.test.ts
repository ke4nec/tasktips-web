import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEMO_EMAIL, MockApi } from "@/api/mock";
import { ApiError } from "@/api/types";
import {
  DEVICE_ID_PREFIX,
  LOCAL_SESSION_KEY,
  PENDING_LOGOUT_KEY,
  useSessionStore,
} from "@/stores/session";
import { useProjectStore } from "@/stores/project";
import { useUiStore } from "@/stores/ui";

describe("浏览器会话（MockApi）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("默认未登录", () => {
    expect(useSessionStore().isAuthenticated).toBe(false);
  });

  it("登录后建立会话并注册 Web 设备", async () => {
    const session = useSessionStore();
    await session.mockLoginQuick();
    expect(session.isAuthenticated).toBe(true);
    expect(session.account?.email).toBe(DEMO_EMAIL);
    expect(session.accessToken).toBeTruthy();
    expect(session.deviceId).toBeTruthy();
    expect(localStorage.getItem(`${DEVICE_ID_PREFIX}:${DEMO_EMAIL}`)).toBe(session.deviceId);
  });

  it("设备 ID 按账号隔离、跨登录保持", async () => {
    const session = useSessionStore();
    await session.mockLoginQuick();
    const first = session.deviceId;
    await session.logout();
    await session.mockLoginQuick();
    expect(session.deviceId).toBe(first);
  });

  it("错误密码登录失败且不残留会话", async () => {
    const session = useSessionStore();
    await expect(session.login(DEMO_EMAIL, "wrong-password")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(session.isAuthenticated).toBe(false);
  });

  it("离线退出挂起远端注销，恢复时补执行", async () => {
    const session = useSessionStore();
    await session.mockLoginQuick();
    const logoutSpy = vi.spyOn(MockApi.prototype, "logout");
    logoutSpy.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "断网"));
    await session.logout();
    expect(localStorage.getItem(PENDING_LOGOUT_KEY)).toBe("1");
    expect(session.isAuthenticated).toBe(false);
    logoutSpy.mockRestore();
    await session.restoreSession();
    expect(localStorage.getItem(PENDING_LOGOUT_KEY)).toBeNull();
    expect(session.isAuthenticated).toBe(false);
  });

  it("退出后清理内存会话与上次项目", async () => {
    const session = useSessionStore();
    await session.mockLoginQuick();
    localStorage.setItem("tasktips:last-project", "demo");
    await session.logout();
    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
    expect(localStorage.getItem("tasktips:last-project")).toBeNull();
  });

  it("离线重开恢复本地账号与项目，但不伪造在线令牌", async () => {
    await useSessionStore().mockLoginQuick();
    const original = useProjectStore().projects;
    setActivePinia(createPinia());
    const refresh = vi
      .spyOn(MockApi.prototype, "refresh")
      .mockRejectedValue(new ApiError("NETWORK_ERROR", "offline"));
    const session = useSessionStore();
    expect(await session.restoreSession()).toBe(true);
    expect(session.canAccessWorkspace).toBe(true);
    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
    expect(useProjectStore().projects).toEqual(original);
    expect(JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY)!)).toEqual({ email: DEMO_EMAIL });
    refresh.mockRestore();
  });

  it("明确撤销认证后不允许从缓存重新进入", async () => {
    await useSessionStore().mockLoginQuick();
    const refresh = vi
      .spyOn(MockApi.prototype, "refresh")
      .mockRejectedValue(new ApiError("DEVICE_REVOKED", "revoked"));
    expect(await useSessionStore().refreshAccess()).toBe(false);
    expect(useSessionStore().canAccessWorkspace).toBe(false);
    expect(localStorage.getItem(LOCAL_SESSION_KEY)).toBeNull();
    refresh.mockRestore();
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
