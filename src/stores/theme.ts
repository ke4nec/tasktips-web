import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "tasktips:theme-preference";

function readPreference(): ThemePreference {
  try {
    const cached = localStorage.getItem(THEME_STORAGE_KEY);
    if (cached === "light" || cached === "dark" || cached === "system") return cached;
  } catch {
    // localStorage 不可用：回退跟随系统
  }
  return "system";
}

function systemIsDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

// 主题偏好（设计文档 §3.3：浅色 / 深色 / 跟随系统）。
// 应用启动时由 main.ts 调用 initTheme()，与 public/theme-boot.js 首帧引导衔接。
export const useThemeStore = defineStore("theme", () => {
  const preference = ref<ThemePreference>(readPreference());
  // 系统深色状态响应式化：computed 会缓存，变化必须经 ref 触发。
  const systemDark = ref(systemIsDark());
  const resolved = computed<Exclude<ThemePreference, "system">>(() =>
    preference.value === "system" ? (systemDark.value ? "dark" : "light") : preference.value,
  );

  function apply() {
    document.documentElement.dataset.theme = resolved.value;
  }

  function setPreference(next: ThemePreference) {
    preference.value = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 隐私模式等：仅本次会话生效
    }
    apply();
  }

  function initTheme() {
    systemDark.value = systemIsDark();
    apply();
    if (typeof window.matchMedia === "function") {
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (event: MediaQueryListEvent) => {
          systemDark.value = event.matches;
          if (preference.value === "system") apply();
        });
    }
  }

  return { preference, resolved, setPreference, initTheme };
});
