import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { THEME_STORAGE_KEY, useThemeStore } from "@/stores/theme";

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const mql = {
    matches,
    addEventListener: vi.fn((_: string, cb: (event: { matches: boolean }) => void) =>
      listeners.add(cb),
    ),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return { mql, listeners };
}

describe("主题偏好", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    setActivePinia(createPinia());
    vi.unstubAllGlobals();
  });

  it("默认跟随系统：深色系统解析为深色", () => {
    stubMatchMedia(true);
    const theme = useThemeStore();
    expect(theme.preference).toBe("system");
    expect(theme.resolved).toBe("dark");
  });

  it("浅色系统解析为浅色", () => {
    stubMatchMedia(false);
    const theme = useThemeStore();
    expect(theme.resolved).toBe("light");
  });

  it("显式偏好覆盖系统并持久化", () => {
    stubMatchMedia(true);
    const theme = useThemeStore();
    theme.setPreference("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("非法缓存回退跟随系统", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    stubMatchMedia(false);
    const theme = useThemeStore();
    expect(theme.preference).toBe("system");
  });

  it("跟随系统时响应系统变化", async () => {
    const { listeners } = stubMatchMedia(false);
    const theme = useThemeStore();
    theme.initTheme();
    expect(document.documentElement.dataset.theme).toBe("light");
    // 模拟系统切到深色
    listeners.forEach((cb) => cb({ matches: true }));
    await nextTick();
    expect(theme.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("显式偏好下系统变化不影响展示", async () => {
    const { listeners } = stubMatchMedia(false);
    const theme = useThemeStore();
    theme.initTheme();
    theme.setPreference("light");
    listeners.forEach((cb) => cb({ matches: true }));
    await nextTick();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
